// admin_panel.js - CMS COMPLETO

const SUPABASE_URL = 'https://tpzuvrvjtxuvmyusjmpq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRwenV2cnZqdHh1dm15dXNqbXBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1NDMwMDAsImV4cCI6MjA4MDExOTAwMH0.YcGZLy7W92H0o0TN4E_v-2PUDtcSXhB-D7x7ob6TTp4';

const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

let currentTab = 'pendiente_validacion';
let refreshInterval;
let currentUnitPrice = 0;

// ==========================================
// 1. NAVEGACIÓN Y VISTAS
// ==========================================

window.switchView = function(view) {
    document.getElementById('view-dashboard').classList.add('hidden');
    document.getElementById('view-settings').classList.add('hidden');
    document.getElementById('btn-view-dashboard').className = "px-4 py-1.5 rounded-md text-sm font-semibold text-slate-500 hover:text-slate-700 transition flex items-center gap-2";
    document.getElementById('btn-view-settings').className = "px-4 py-1.5 rounded-md text-sm font-semibold text-slate-500 hover:text-slate-700 transition flex items-center gap-2";

    document.getElementById(`view-${view}`).classList.remove('hidden');
    document.getElementById(`btn-view-${view}`).className = "nav-btn-active px-4 py-1.5 rounded-md text-sm font-semibold transition flex items-center gap-2";

    if(view === 'settings') loadSorteoConfiguration();
}

// ==========================================
// 2. LOGICA DEL DASHBOARD (LO VIEJO)
// ==========================================
// ... (Aquí van las funciones de carga de stats y ordenes que ya tenías, resumidas)

async function checkAuth() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) window.location.href = 'admin_login.html';
    else {
        loadDashboardData();
        // Listener clicks dropdowns
        document.addEventListener('click', (e) => { if (!e.target.closest('.relative')) closeAllDropdowns(); });
        
        if (refreshInterval) clearInterval(refreshInterval);
        refreshInterval = setInterval(() => {
            const el = document.getElementById('raffle-title');
            if(el && el.dataset.id) loadTicketStats(el.dataset.id);
        }, 10000);
        
        // Listener Edit Quantity
        const qtyInput = document.getElementById('edit-cantidad');
        if(qtyInput) {
            qtyInput.addEventListener('input', function() {
                const newQty = parseInt(this.value) || 0;
                const newTotal = newQty * currentUnitPrice;
                document.getElementById('edit-monto').value = newTotal.toFixed(2);
            });
        }
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

function safeSetText(id, text) { const el = document.getElementById(id); if (el) el.innerText = text; }

async function loadTicketStats(sorteoId) {
    const { count: disp } = await supabaseClient.from('tickets').select('*', { count: 'exact', head: true }).eq('id_sorteo', sorteoId).eq('estado', 'disponible');
    const { count: vend } = await supabaseClient.from('tickets').select('*', { count: 'exact', head: true }).eq('id_sorteo', sorteoId).eq('estado', 'vendido');
    const { count: bloq } = await supabaseClient.from('tickets').select('*', { count: 'exact', head: true }).eq('id_sorteo', sorteoId).eq('estado', 'bloqueado');
    const { count: pend } = await supabaseClient.from('ordenes').select('*', { count: 'exact', head: true }).eq('estado', 'pendiente_validacion');
    safeSetText('stat-available', disp || 0); safeSetText('stat-sold', vend || 0); safeSetText('stat-blocked', bloq || 0); safeSetText('stat-pending', pend || 0);
}

window.switchTab = function(tab) {
    currentTab = tab;
    ['pendiente_validacion', 'aprobado', 'rechazado'].forEach((t, i) => {
        const btn = document.getElementById(['tab-pendientes', 'tab-aprobados', 'tab-rechazados'][i]);
        if(t === tab) btn.classList.add('tab-active'); else btn.classList.remove('tab-active');
    });
    loadOrders(tab);
}

async function loadOrders(estado) {
    const tbody = document.getElementById('orders-table-body');
    tbody.innerHTML = `<tr><td colspan="10" class="text-center py-12"><i class="fa-solid fa-circle-notch fa-spin text-indigo-500 text-2xl"></i></td></tr>`;
    const { data: ordenes } = await supabaseClient.from('ordenes').select('*').eq('estado', estado).order('creado_en', { ascending: false });

    if (!ordenes || ordenes.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" class="text-center py-12 text-slate-400">No hay registros aquí.</td></tr>`;
        return;
    }

    let html = '';
    ordenes.forEach(orden => {
        const fecha = new Date(orden.creado_en).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' });
        
        let menuItems = `<button onclick="openEditModal('${orden.id}')" class="block w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-indigo-600 transition"><i class="fa-solid fa-pen-to-square w-5"></i> Editar Info</button>`;
        if (estado === 'pendiente_validacion') {
            menuItems += `<button onclick="approveOrder('${orden.id}')" class="block w-full text-left px-4 py-2 text-sm text-emerald-600 hover:bg-emerald-50 transition"><i class="fa-solid fa-check w-5"></i> Aprobar</button>
                          <button onclick="rejectOrder('${orden.id}')" class="block w-full text-left px-4 py-2 text-sm text-rose-600 hover:bg-rose-50 transition"><i class="fa-solid fa-xmark w-5"></i> Rechazar</button>`;
        } else if (estado === 'aprobado') {
            menuItems += `<button onclick="rejectOrder('${orden.id}')" class="block w-full text-left px-4 py-2 text-sm text-rose-600 hover:bg-rose-50 transition"><i class="fa-solid fa-ban w-5"></i> Rechazar (Liberar)</button>
                          <a href="https://wa.me/${orden.telefono}" target="_blank" class="block w-full text-left px-4 py-2 text-sm text-emerald-600 hover:bg-emerald-50 transition"><i class="fa-brands fa-whatsapp w-5"></i> Contactar</a>`;
        } else if (estado === 'rechazado') {
            menuItems += `<button onclick="approveOrder('${orden.id}')" class="block w-full text-left px-4 py-2 text-sm text-emerald-600 hover:bg-emerald-50 transition"><i class="fa-solid fa-check-double w-5"></i> Reactivar (Aprobar)</button>`;
        }

        html += `<tr class="bg-white hover:bg-slate-50 transition border-b border-slate-50 group">
                <td class="px-6 py-4 font-mono text-xs text-slate-400">#${orden.id.slice(0,6)}</td>
                <td class="px-6 py-4 font-bold text-slate-700 uppercase">${orden.nombre}</td>
                <td class="px-6 py-4"><div class="text-xs font-semibold text-slate-600">${orden.telefono}</div><div class="text-[10px] text-slate-400 font-mono">${orden.cedula}</div></td>
                <td class="px-6 py-4 text-xs text-slate-500">${orden.metodo_pago}</td>
                <td class="px-6 py-4 text-center"><span class="bg-indigo-50 text-indigo-700 font-bold px-2.5 py-1 rounded-lg text-xs shadow-sm border border-indigo-100">${orden.cantidad_boletos}</span></td>
                <td class="px-6 py-4 font-bold text-slate-700">Bs. ${orden.monto_total}</td>
                <td class="px-6 py-4 font-mono text-xs text-slate-500">${orden.referencia_pago || 'N/A'}</td>
                <td class="px-6 py-4 text-center">${orden.url_comprobante ? `<button onclick="viewProof('${orden.url_comprobante}')" class="text-indigo-500 hover:text-indigo-700 transition"><i class="fa-solid fa-image text-lg"></i></button>` : '<span class="text-slate-300">-</span>'}</td>
                <td class="px-6 py-4 text-xs text-slate-400">${fecha}</td>
                <td class="px-6 py-4 text-right">
                    <div class="relative inline-block text-left">
                        <button onclick="toggleDropdown('${orden.id}', event)" class="p-2 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition"><i class="fa-solid fa-ellipsis-vertical text-lg"></i></button>
                        <div id="dropdown-${orden.id}" class="dropdown-menu absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-slate-100 z-50 overflow-hidden">${menuItems}</div>
                    </div>
                </td>
            </tr>`;
    });
    tbody.innerHTML = html;
}

window.toggleDropdown = function(id, event) {
    event.stopPropagation();
    closeAllDropdowns();
    const menu = document.getElementById(`dropdown-${id}`);
    if (menu) menu.classList.add('show');
}
function closeAllDropdowns() { document.querySelectorAll('.dropdown-menu').forEach(el => el.classList.remove('show')); }

window.openEditModal = async function(id) {
    const { data: orden } = await supabaseClient.from('ordenes').select('*').eq('id', id).single();
    if (!orden) return;
    currentUnitPrice = orden.monto_total / orden.cantidad_boletos; if(isNaN(currentUnitPrice)) currentUnitPrice = 700;
    
    document.getElementById('edit-id').value = orden.id;
    document.getElementById('edit-nombre').value = orden.nombre;
    document.getElementById('edit-cedula').value = orden.cedula;
    document.getElementById('edit-telefono').value = orden.telefono;
    document.getElementById('edit-email').value = orden.email;
    document.getElementById('edit-cantidad').value = orden.cantidad_boletos;
    document.getElementById('edit-cantidad').dataset.original = orden.cantidad_boletos;
    document.getElementById('edit-monto').value = orden.monto_total;
    document.getElementById('edit-referencia').value = orden.referencia_pago;
    document.getElementById('edit-order-id').innerText = '#' + orden.id.slice(0,6);
    document.getElementById('edit-file').value = '';
    document.getElementById('display-unit-price').innerText = `Bs. ${currentUnitPrice.toFixed(2)}`;
    document.getElementById('modal-edit').classList.remove('hidden');
}

window.saveEditOrder = async function() {
    const id = document.getElementById('edit-id').value;
    const nuevaCant = parseInt(document.getElementById('edit-cantidad').value);
    const originalCant = parseInt(document.getElementById('edit-cantidad').dataset.original);
    const fileInput = document.getElementById('edit-file');

    if (!confirm("¿Guardar cambios?")) return;
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
        if (fileInput.files.length > 0) {
            const file = fileInput.files[0];
            const fileName = `${Date.now()}_edited.${file.name.split('.').pop()}`;
            const { error: upErr } = await supabaseClient.storage.from('comprobantes').upload(fileName, file);
            if (upErr) throw upErr;
            const { data: publicUrl } = supabaseClient.storage.from('comprobantes').getPublicUrl(fileName);
            updates.url_comprobante = publicUrl.publicUrl;
        }

        if (nuevaCant !== originalCant) {
            await supabaseClient.from('tickets').update({ estado: 'disponible', id_orden: null }).eq('id_orden', id);
            const { data: newTickets, error: tickErr } = await supabaseClient.from('tickets').select('id').eq('estado', 'disponible').limit(nuevaCant);
            if (tickErr || newTickets.length < nuevaCant) throw new Error("No hay suficientes tickets disponibles.");
            
            const { data: currentOrder } = await supabaseClient.from('ordenes').select('estado').eq('id', id).single();
            const nuevoEstadoTicket = currentOrder.estado === 'aprobado' ? 'vendido' : 'bloqueado';
            const ids = newTickets.map(t => t.id);
            await supabaseClient.from('tickets').update({ estado: nuevoEstadoTicket, id_orden: id }).in('id', ids);
        }

        const { error } = await supabaseClient.from('ordenes').update(updates).eq('id', id);
        if (error) throw error;
        alert("Actualizado.");
        closeModal('modal-edit');
        loadDashboardData();
    } catch(e) { alert("Error: " + e.message); }
}

window.approveOrder = async function(id) {
    if(!confirm("¿Aprobar?")) return;
    const { count } = await supabaseClient.from('tickets').select('*', { count: 'exact', head: true }).eq('id_orden', id);
    if (count === 0) {
        const { data: orden } = await supabaseClient.from('ordenes').select('cantidad_boletos').eq('id', id).single();
        const { data: newTickets } = await supabaseClient.from('tickets').select('id').eq('estado', 'disponible').limit(orden.cantidad_boletos);
        if (newTickets.length < orden.cantidad_boletos) return alert("Sin stock para reactivar.");
        const ids = newTickets.map(t => t.id);
        await supabaseClient.from('tickets').update({ estado: 'vendido', id_orden: id }).in('id', ids);
    } else {
        await supabaseClient.from('tickets').update({ estado: 'vendido' }).eq('id_orden', id);
    }
    await supabaseClient.from('ordenes').update({ estado: 'aprobado' }).eq('id', id);
    loadDashboardData();
}

window.rejectOrder = async function(id) {
    if(!confirm("¿Rechazar?")) return;
    await supabaseClient.from('ordenes').update({ estado: 'rechazado' }).eq('id', id);
    await supabaseClient.from('tickets').update({ estado: 'disponible', id_orden: null }).eq('id_orden', id);
    loadDashboardData();
}

window.viewProof = function(url) {
    document.getElementById('proof-image').src = url;
    document.getElementById('proof-download').href = url;
    document.getElementById('modal-proof').classList.remove('hidden');
}
window.closeModal = function(id) { document.getElementById(id).classList.add('hidden'); }
window.logout = async function() { await supabaseClient.auth.signOut(); window.location.href = 'admin_login.html'; }

// ==========================================
// 3. NUEVA LÓGICA: CONFIGURACIÓN SORTEO
// ==========================================

async function loadSorteoConfiguration() {
    try {
        // Cargar Sorteo
        const { data: sorteo } = await supabaseClient.from('sorteos').select('*').eq('estado', 'activo').single();
        if(sorteo) {
            document.getElementById('conf-id').value = sorteo.id;
            document.getElementById('conf-titulo').value = sorteo.titulo;
            document.getElementById('conf-loteria').value = sorteo.loteria;
            document.getElementById('conf-precio').value = sorteo.precio_boleto;
            document.getElementById('conf-fecha').value = sorteo.fecha_sorteo;
            document.getElementById('conf-estado').value = sorteo.estado;
            document.getElementById('conf-img-preview').src = sorteo.url_flyer || 'https://via.placeholder.com/150';
        }
        // Cargar Métodos Pago
        loadPaymentMethods();
    } catch(e) { console.error(e); }
}

async function saveSorteoConfig() {
    const id = document.getElementById('conf-id').value;
    if(!id) return alert("No hay sorteo cargado.");
    
    const updates = {
        titulo: document.getElementById('conf-titulo').value,
        loteria: document.getElementById('conf-loteria').value,
        precio_boleto: parseFloat(document.getElementById('conf-precio').value),
        fecha_sorteo: document.getElementById('conf-fecha').value,
        estado: document.getElementById('conf-estado').value
    };

    const fileInput = document.getElementById('conf-file');
    try {
        if(fileInput.files.length > 0) {
            const file = fileInput.files[0];
            const fileName = `flyer_${Date.now()}.${file.name.split('.').pop()}`;
            // Subir a bucket 'images' (Asegúrate que exista en Supabase)
            const { error: upErr } = await supabaseClient.storage.from('images').upload(fileName, file);
            if(upErr) throw upErr;
            const { data: publicUrl } = supabaseClient.storage.from('images').getPublicUrl(fileName);
            updates.url_flyer = publicUrl.publicUrl;
        }

        const { error } = await supabaseClient.from('sorteos').update(updates).eq('id', id);
        if(error) throw error;
        
        alert("Configuración Guardada.");
        // Refrescar si cambió estado
        if(updates.estado === 'finalizado') location.reload();
        
    } catch(e) { alert("Error: " + e.message); }
}

async function loadPaymentMethods() {
    const container = document.getElementById('payment-methods-grid');
    container.innerHTML = 'Cargando...';
    
    const { data: methods } = await supabaseClient.from('metodos_pago').select('*').order('id');
    
    if(!methods || methods.length === 0) {
        container.innerHTML = '<p class="col-span-3 text-center text-slate-400">No hay métodos de pago.</p>';
        return;
    }

    let html = '';
    methods.forEach(m => {
        const activeClass = m.activo ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50 opacity-60';
        html += `
            <div class="border rounded-xl p-4 relative ${activeClass}">
                <div class="flex justify-between items-start mb-2">
                    <h4 class="font-bold text-slate-700">${m.banco}</h4>
                    <div class="flex gap-2">
                        <button onclick="editPaymentMethod(${m.id})" class="text-indigo-600 hover:text-indigo-800"><i class="fa-solid fa-pen"></i></button>
                        <button onclick="deletePaymentMethod(${m.id})" class="text-red-500 hover:text-red-700"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>
                <div class="text-sm text-slate-600 space-y-1">
                    <p><span class="font-semibold">Titular:</span> ${m.titular}</p>
                    <p><span class="font-semibold">CI:</span> ${m.cedula}</p>
                    <p><span class="font-semibold">Tel:</span> ${m.telefono}</p>
                    <p class="text-xs uppercase bg-white inline-block px-2 py-0.5 rounded border border-slate-200 mt-1">${m.tipo}</p>
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
}

// CRUD MÉTODOS PAGO
window.openPaymentModal = function() {
    document.getElementById('pay-id').value = '';
    document.getElementById('pay-banco').value = '';
    document.getElementById('pay-titular').value = '';
    document.getElementById('pay-cedula').value = '';
    document.getElementById('pay-telefono').value = '';
    document.getElementById('modal-payment').classList.remove('hidden');
}

window.editPaymentMethod = async function(id) {
    const { data: m } = await supabaseClient.from('metodos_pago').select('*').eq('id', id).single();
    if(m) {
        document.getElementById('pay-id').value = m.id;
        document.getElementById('pay-banco').value = m.banco;
        document.getElementById('pay-titular').value = m.titular;
        document.getElementById('pay-cedula').value = m.cedula;
        document.getElementById('pay-telefono').value = m.telefono;
        document.getElementById('pay-tipo').value = m.tipo;
        document.getElementById('modal-payment').classList.remove('hidden');
    }
}

window.savePaymentMethod = async function() {
    const id = document.getElementById('pay-id').value;
    const data = {
        banco: document.getElementById('pay-banco').value,
        titular: document.getElementById('pay-titular').value,
        cedula: document.getElementById('pay-cedula').value,
        telefono: document.getElementById('pay-telefono').value,
        tipo: document.getElementById('pay-tipo').value
    };
    
    if(!data.banco || !data.titular) return alert("Completa los datos.");

    if(id) {
        await supabaseClient.from('metodos_pago').update(data).eq('id', id);
    } else {
        await supabaseClient.from('metodos_pago').insert([data]);
    }
    closeModal('modal-payment');
    loadPaymentMethods();
}

window.deletePaymentMethod = async function(id) {
    if(confirm("¿Eliminar este método de pago?")) {
        await supabaseClient.from('metodos_pago').delete().eq('id', id);
        loadPaymentMethods();
    }
}

window.createNewSorteo = async function() {
    if(!confirm("⚠️ ¡PELIGRO! Esto archivará el sorteo actual y creará uno nuevo. ¿Estás seguro?")) return;
    
    const titulo = prompt("Nombre del nuevo sorteo:");
    if(!titulo) return;

    // 1. Finalizar actual
    await supabaseClient.from('sorteos').update({ estado: 'finalizado' }).eq('estado', 'activo');
    
    // 2. Crear nuevo
    const { data, error } = await supabaseClient.from('sorteos').insert([{
        titulo: titulo,
        precio_boleto: 0,
        fecha_sorteo: new Date().toISOString().split('T')[0],
        estado: 'activo'
    }]).select();

    if(error) alert("Error: " + error.message);
    else {
        alert("Nuevo sorteo creado. Configúralo ahora.");
        location.reload();
    }
}

checkAuth();
