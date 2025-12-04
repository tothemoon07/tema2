// admin_panel.js - VERSIÓN PRO: EDICIÓN AVANZADA Y REGENERACIÓN

// ⚠️ TUS CLAVES
const SUPABASE_URL = 'https://tpzuvrvjtxuvmyusjmpq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRwenV2cnZqdHh1dm15dXNqbXBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1NDMwMDAsImV4cCI6MjA4MDExOTAwMH0.YcGZLy7W92H0o0TN4E_v-2PUDtcSXhB-D7x7ob6TTp4';

const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

let currentTab = 'pendiente_validacion';
let refreshInterval;
let activeDropdown = null; // Para controlar menús abiertos

function safeSetText(id, text) {
    const el = document.getElementById(id);
    if (el) el.innerText = text;
}

// 1. INICIO Y SESIÓN
async function checkAuth() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
        window.location.href = 'admin_login.html';
    } else {
        loadDashboardData();
        // Cierra dropdowns al hacer click fuera
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.relative')) closeAllDropdowns();
        });
        
        if (refreshInterval) clearInterval(refreshInterval);
        refreshInterval = setInterval(() => {
            const el = document.getElementById('raffle-title');
            if(el && el.dataset.id) loadTicketStats(el.dataset.id);
        }, 10000);
    }
}

async function loadDashboardData() {
    try {
        const { data: sorteo } = await supabaseClient.from('sorteos').select('*').eq('estado', 'activo').single();
        if (sorteo) {
            document.getElementById('raffle-title').innerText = sorteo.titulo;
            document.getElementById('raffle-title').dataset.id = sorteo.id;
            loadTicketStats(sorteo.id);
            loadOrders(currentTab);
        }
    } catch(e) { console.error(e); }
}

async function loadTicketStats(sorteoId) {
    const { count: disp } = await supabaseClient.from('tickets').select('*', { count: 'exact', head: true }).eq('id_sorteo', sorteoId).eq('estado', 'disponible');
    const { count: vend } = await supabaseClient.from('tickets').select('*', { count: 'exact', head: true }).eq('id_sorteo', sorteoId).eq('estado', 'vendido');
    const { count: bloq } = await supabaseClient.from('tickets').select('*', { count: 'exact', head: true }).eq('id_sorteo', sorteoId).eq('estado', 'bloqueado');
    const { count: pend } = await supabaseClient.from('ordenes').select('*', { count: 'exact', head: true }).eq('estado', 'pendiente_validacion');

    safeSetText('stat-available', disp || 0);
    safeSetText('stat-sold', vend || 0);
    safeSetText('stat-blocked', bloq || 0);
    safeSetText('stat-pending', pend || 0);
}

// 2. SISTEMA DE TABS
window.switchTab = function(tab) {
    currentTab = tab;
    ['pendiente_validacion', 'aprobado', 'rechazado'].forEach((t, i) => {
        const btn = document.getElementById(['tab-pendientes', 'tab-aprobados', 'tab-rechazados'][i]);
        if(t === tab) btn.classList.add('tab-active');
        else btn.classList.remove('tab-active');
    });
    loadOrders(tab);
}

// 3. CARGAR TABLA (ESTILO MODERNO)
async function loadOrders(estado) {
    const tbody = document.getElementById('orders-table-body');
    tbody.innerHTML = `<tr><td colspan="10" class="text-center py-12"><i class="fa-solid fa-circle-notch fa-spin text-indigo-500 text-2xl"></i></td></tr>`;

    const { data: ordenes } = await supabaseClient
        .from('ordenes').select('*').eq('estado', estado).order('creado_en', { ascending: false });

    if (!ordenes || ordenes.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" class="text-center py-12 text-slate-400">No hay registros aquí.</td></tr>`;
        return;
    }

    let html = '';
    ordenes.forEach(orden => {
        const fecha = new Date(orden.creado_en).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' });
        
        // MENÚ CONTEXTUAL DINÁMICO
        let menuItems = `
            <button onclick="openEditModal('${orden.id}')" class="block w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-indigo-600 transition">
                <i class="fa-solid fa-pen-to-square w-5"></i> Editar Info
            </button>
        `;

        if (estado === 'pendiente_validacion') {
            menuItems += `
                <button onclick="approveOrder('${orden.id}')" class="block w-full text-left px-4 py-2 text-sm text-emerald-600 hover:bg-emerald-50 transition">
                    <i class="fa-solid fa-check w-5"></i> Aprobar
                </button>
                <button onclick="rejectOrder('${orden.id}')" class="block w-full text-left px-4 py-2 text-sm text-rose-600 hover:bg-rose-50 transition">
                    <i class="fa-solid fa-xmark w-5"></i> Rechazar
                </button>
            `;
        } else if (estado === 'aprobado') {
            menuItems += `
                <button onclick="rejectOrder('${orden.id}')" class="block w-full text-left px-4 py-2 text-sm text-rose-600 hover:bg-rose-50 transition">
                    <i class="fa-solid fa-ban w-5"></i> Rechazar (Liberar)
                </button>
                <a href="https://wa.me/${orden.telefono}" target="_blank" class="block w-full text-left px-4 py-2 text-sm text-emerald-600 hover:bg-emerald-50 transition">
                    <i class="fa-brands fa-whatsapp w-5"></i> Contactar
                </a>
            `;
        } else if (estado === 'rechazado') {
            menuItems += `
                <button onclick="approveOrder('${orden.id}')" class="block w-full text-left px-4 py-2 text-sm text-emerald-600 hover:bg-emerald-50 transition">
                    <i class="fa-solid fa-check-double w-5"></i> Reactivar (Aprobar)
                </button>
            `;
        }

        html += `
            <tr class="bg-white hover:bg-slate-50 transition border-b border-slate-50 group">
                <td class="px-6 py-4 font-mono text-xs text-slate-400">#${orden.id.slice(0,6)}</td>
                <td class="px-6 py-4 font-bold text-slate-700 uppercase">${orden.nombre}</td>
                <td class="px-6 py-4">
                    <div class="text-xs font-semibold text-slate-600">${orden.telefono}</div>
                    <div class="text-[10px] text-slate-400">${orden.email || '-'}</div>
                    <div class="text-[10px] text-slate-400 font-mono">${orden.cedula}</div>
                </td>
                <td class="px-6 py-4 text-xs text-slate-500">${orden.metodo_pago}</td>
                <td class="px-6 py-4 text-center">
                    <span class="bg-indigo-50 text-indigo-700 font-bold px-2.5 py-1 rounded-lg text-xs shadow-sm border border-indigo-100">${orden.cantidad_boletos}</span>
                </td>
                <td class="px-6 py-4 font-bold text-slate-700">Bs. ${orden.monto_total}</td>
                <td class="px-6 py-4 font-mono text-xs text-slate-500">${orden.referencia_pago || 'N/A'}</td>
                <td class="px-6 py-4 text-center">
                    ${orden.url_comprobante ? `<button onclick="viewProof('${orden.url_comprobante}')" class="text-indigo-500 hover:text-indigo-700 transition"><i class="fa-solid fa-image text-lg"></i></button>` : '<span class="text-slate-300">-</span>'}
                </td>
                <td class="px-6 py-4 text-xs text-slate-400">${fecha}</td>
                <td class="px-6 py-4 text-right">
                    <div class="relative inline-block text-left">
                        <button onclick="toggleDropdown('${orden.id}', event)" class="p-2 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition">
                            <i class="fa-solid fa-ellipsis-vertical text-lg"></i>
                        </button>
                        <div id="dropdown-${orden.id}" class="dropdown-menu absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-slate-100 z-50 overflow-hidden">
                            ${menuItems}
                        </div>
                    </div>
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
}

// 4. LÓGICA DE DROPDOWNS
window.toggleDropdown = function(id, event) {
    event.stopPropagation();
    closeAllDropdowns();
    const menu = document.getElementById(`dropdown-${id}`);
    if (menu) menu.classList.add('show');
}

function closeAllDropdowns() {
    document.querySelectorAll('.dropdown-menu').forEach(el => el.classList.remove('show'));
}

// 5. EDICIÓN AVANZADA
window.openEditModal = async function(id) {
    const { data: orden } = await supabaseClient.from('ordenes').select('*').eq('id', id).single();
    if (!orden) return;

    // Llenar datos
    document.getElementById('edit-id').value = orden.id;
    document.getElementById('edit-nombre').value = orden.nombre;
    document.getElementById('edit-cedula').value = orden.cedula;
    document.getElementById('edit-telefono').value = orden.telefono;
    document.getElementById('edit-email').value = orden.email;
    document.getElementById('edit-cantidad').value = orden.cantidad_boletos;
    document.getElementById('edit-cantidad').dataset.original = orden.cantidad_boletos; // Guardar original para comparar
    document.getElementById('edit-monto').value = orden.monto_total;
    document.getElementById('edit-referencia').value = orden.referencia_pago;
    document.getElementById('edit-order-id').innerText = '#' + orden.id.slice(0,6);
    document.getElementById('edit-file').value = ''; // Reset file input

    // Mostrar Modal
    const modal = document.getElementById('modal-edit');
    modal.classList.remove('hidden');
    modal.querySelector('div').classList.add('opacity-100');
}

window.saveEditOrder = async function() {
    const id = document.getElementById('edit-id').value;
    const nuevaCant = parseInt(document.getElementById('edit-cantidad').value);
    const originalCant = parseInt(document.getElementById('edit-cantidad').dataset.original);
    const fileInput = document.getElementById('edit-file');

    if (!confirm("¿Guardar cambios? Si cambiaste la cantidad, se generarán nuevos tickets.")) return;

    let updates = {
        nombre: document.getElementById('edit-nombre').value,
        cedula: document.getElementById('edit-cedula').value,
        telefono: document.getElementById('edit-telefono').value,
        email: document.getElementById('edit-email').value,
        monto_total: parseFloat(document.getElementById('edit-monto').value),
        referencia_pago: document.getElementById('edit-referencia').value,
        cantidad_boletos: nuevaCant
    };

    try {
        // 1. Si subió nueva foto
        if (fileInput.files.length > 0) {
            const file = fileInput.files[0];
            const fileName = `${Date.now()}_edited.${file.name.split('.').pop()}`;
            const { error: upErr } = await supabaseClient.storage.from('comprobantes').upload(fileName, file);
            if (upErr) throw upErr;
            const { data: publicUrl } = supabaseClient.storage.from('comprobantes').getPublicUrl(fileName);
            updates.url_comprobante = publicUrl.publicUrl;
        }

        // 2. Si cambió la cantidad -> REGENERAR TICKETS
        if (nuevaCant !== originalCant) {
            // A. Liberar tickets viejos
            await supabaseClient.from('tickets').update({ estado: 'disponible', id_orden: null }).eq('id_orden', id);
            
            // B. Buscar nuevos disponibles
            const { data: newTickets, error: tickErr } = await supabaseClient
                .from('tickets').select('id').eq('estado', 'disponible').limit(nuevaCant);
            
            if (tickErr || newTickets.length < nuevaCant) throw new Error("No hay suficientes tickets disponibles para el cambio.");

            // C. Asignar nuevos (Manteniendo el estado actual de la orden: si estaba aprobada, quedan vendidos)
            const { data: currentOrder } = await supabaseClient.from('ordenes').select('estado').eq('id', id).single();
            const nuevoEstadoTicket = currentOrder.estado === 'aprobado' ? 'vendido' : 'bloqueado'; // O pendiente

            const ids = newTickets.map(t => t.id);
            await supabaseClient.from('tickets').update({ estado: nuevoEstadoTicket, id_orden: id }).in('id', ids);
        }

        // 3. Actualizar orden
        const { error } = await supabaseClient.from('ordenes').update(updates).eq('id', id);
        if (error) throw error;

        alert("Orden actualizada correctamente.");
        closeModal('modal-edit');
        loadDashboardData();

    } catch(e) {
        alert("Error: " + e.message);
    }
}

// 6. ACCIONES DE ESTADO (APROBAR / RECHAZAR)
window.approveOrder = async function(id) {
    if(!confirm("¿Aprobar orden?")) return;
    
    // Si viene de rechazado, primero intentamos asignar tickets
    // Verificar si ya tiene tickets (si viene de pendiente los tiene, si viene de rechazado NO)
    const { count } = await supabaseClient.from('tickets').select('*', { count: 'exact', head: true }).eq('id_orden', id);
    
    if (count === 0) {
        // Caso: Reactivar desde Rechazado (Necesita nuevos tickets)
        const { data: orden } = await supabaseClient.from('ordenes').select('cantidad_boletos').eq('id', id).single();
        const { data: newTickets } = await supabaseClient.from('tickets').select('id').eq('estado', 'disponible').limit(orden.cantidad_boletos);
        
        if (newTickets.length < orden.cantidad_boletos) return alert("No hay stock suficiente para reactivar.");
        
        const ids = newTickets.map(t => t.id);
        await supabaseClient.from('tickets').update({ estado: 'vendido', id_orden: id }).in('id', ids);
    } else {
        // Caso: Normal (Ya tiene tickets, solo cambiar estado)
        await supabaseClient.from('tickets').update({ estado: 'vendido' }).eq('id_orden', id);
    }

    await supabaseClient.from('ordenes').update({ estado: 'aprobado' }).eq('id', id);
    loadDashboardData();
}

window.rejectOrder = async function(id) {
    if(!confirm("¿Rechazar y liberar tickets?")) return;
    await supabaseClient.from('ordenes').update({ estado: 'rechazado' }).eq('id', id);
    await supabaseClient.from('tickets').update({ estado: 'disponible', id_orden: null }).eq('id_orden', id);
    loadDashboardData();
}

// UTILIDADES
window.viewProof = function(url) {
    const el = document.getElementById('modal-proof');
    document.getElementById('proof-image').src = url;
    document.getElementById('proof-download').href = url;
    el.classList.remove('hidden');
    setTimeout(() => el.style.opacity = '1', 10);
}
window.closeModal = function(id) {
    const el = document.getElementById(id);
    if(id === 'modal-proof') el.style.opacity = '0';
    setTimeout(() => el.classList.add('hidden'), 300);
}
window.logout = async function() { await supabaseClient.auth.signOut(); window.location.href = 'admin_login.html'; }

checkAuth();
