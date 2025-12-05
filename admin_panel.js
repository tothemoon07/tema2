// admin_panel.js - VERSIÓN MONITOR EN VIVO (TU CÓDIGO ORIGINAL + AUTO-REFRESH INTELIGENTE)

const SUPABASE_URL = 'https://tpzuvrvjtxuvmyusjmpq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRwenV2cnZqdHh1dm15dXNqbXBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1NDMwMDAsImV4cCI6MjA4MDExOTAwMH0.YcGZLy7W92H0o0TN4E_v-2PUDtcSXhB-D7x7ob6TTp4';

const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

let currentTab = 'pendiente_validacion';
let refreshInterval;
let currentUnitPrice = 0;
// NUEVO: Variable para recordar cuántas órdenes había antes
let lastPendingCount = -1; 

// ==========================================
// 1. NAVEGACIÓN Y UI
// ==========================================

window.toggleSidebar = function() {
    const sidebar = document.getElementById('sidebar');
    const isHidden = sidebar.classList.contains('-translate-x-full');
    if (isHidden) {
        sidebar.classList.remove('-translate-x-full', 'absolute');
        sidebar.classList.add('translate-x-0', 'absolute', 'md:relative');
    } else {
        sidebar.classList.add('-translate-x-full', 'absolute');
        sidebar.classList.remove('translate-x-0', 'md:relative');
    }
}

window.switchView = function(view) {
    // Ocultar todas las vistas
    ['dashboard', 'active-raffle', 'new-raffle', 'payments'].forEach(v => {
        document.getElementById(`view-${v}`).classList.add('hidden');
        const nav = document.getElementById(`nav-${v}`);
        if(nav) nav.classList.remove('active');
    });

    // Mostrar seleccionada
    document.getElementById(`view-${view}`).classList.remove('hidden');
    const activeNav = document.getElementById(`nav-${view}`);
    if(activeNav) activeNav.classList.add('active');

    // Cerrar sidebar en móvil
    if(window.innerWidth < 768) {
        document.getElementById('sidebar').classList.add('-translate-x-full');
    }

    // Cargar datos según vista
    if(view === 'dashboard') loadDashboardData();
    if(view === 'active-raffle') loadActiveRaffle();
    if(view === 'payments') loadPaymentMethods();
}

// 🔥 SELECCIONADOR DE RANGO (BOTONES) 🔥
window.selectRange = function(value, btnElement) {
    // Actualizar input oculto
    document.getElementById('new-rango-value').value = value;
    
    // Quitar clase 'selected' a todos
    document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('selected'));
    
    // Agregar clase 'selected' al clickeado
    btnElement.classList.add('selected');
}

// ==========================================
// 2. DASHBOARD (GESTIÓN DE ÓRDENES)
// ==========================================

async function checkAuth() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) window.location.href = 'admin_login.html';
    else {
        loadDashboardData();
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
            document.getElementById('raffle-id-display').innerText = sorteo.id;
            // Guardamos ID en dataset para uso global
            document.getElementById('raffle-title').dataset.id = sorteo.id;
            
            loadTicketStats(sorteo.id);
            loadOrders(currentTab);
            
            // 🔥 ACTUALIZACIÓN EN VIVO (CADA 5 SEGUNDOS) 🔥
            if (refreshInterval) clearInterval(refreshInterval);
            refreshInterval = setInterval(() => loadTicketStats(sorteo.id), 5000); 

        } else {
             document.getElementById('raffle-title').innerText = "Sin sorteo activo";
             document.getElementById('raffle-id-display').innerText = "-";
             document.getElementById('raffle-title').dataset.id = ""; // Limpiar ID
             
             // Limpiar tabla si no hay sorteo
             document.getElementById('orders-table-body').innerHTML = `<tr><td colspan="7" class="text-center py-12 text-slate-400">No hay sorteo activo. Las órdenes anteriores están archivadas.</td></tr>`;
             
             // Limpiar stats
             safeSetText('stat-available', '-'); 
             safeSetText('stat-sold', '-'); 
             safeSetText('stat-blocked', '-'); 
             safeSetText('stat-pending', '-');
        }
    } catch(e) { console.error(e); }
}

function safeSetText(id, text) { const el = document.getElementById(id); if (el) el.innerText = text; }

async function loadTicketStats(sorteoId) {
    if(!sorteoId) return;

    // Obtener datos
    const { count: disp } = await supabaseClient.from('tickets').select('*', { count: 'exact', head: true }).eq('id_sorteo', sorteoId).eq('estado', 'disponible');
    const { count: vend } = await supabaseClient.from('tickets').select('*', { count: 'exact', head: true }).eq('id_sorteo', sorteoId).eq('estado', 'vendido');
    const { count: bloq } = await supabaseClient.from('tickets').select('*', { count: 'exact', head: true }).eq('id_sorteo', sorteoId).eq('estado', 'bloqueado');
    const { count: pend } = await supabaseClient.from('ordenes').select('*', { count: 'exact', head: true }).eq('estado', 'pendiente_validacion').eq('id_sorteo', sorteoId);
    
    // Actualizar Textos
    safeSetText('stat-available', disp || 0); 
    safeSetText('stat-sold', vend || 0); 
    safeSetText('stat-pending', pend || 0);
    
    // Actualizar "En Proceso" con Efecto de Latido ❤️
    const blockedEl = document.getElementById('stat-blocked');
    if(blockedEl) {
        blockedEl.innerText = bloq || 0;
        // Agregar clase para animación rápida
        blockedEl.classList.add('scale-125', 'transition-transform', 'duration-200', 'text-rose-600');
        setTimeout(() => {
            blockedEl.classList.remove('scale-125', 'text-rose-600');
        }, 200);
    }

    // 🔥 DETECTOR INTELIGENTE DE NUEVAS ÓRDENES 🔥
    // Si lastPendingCount no es -1 (significa que ya cargó al menos una vez) Y hay más pendientes que antes...
    if (lastPendingCount !== -1 && pend > lastPendingCount) {
        // 1. Mostrar Notificación
        const Toast = Swal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 4000, timerProgressBar: true });
        Toast.fire({ icon: 'success', title: '¡Nueva Orden Recibida!' });
        
        // 2. Si estamos en la pestaña de pendientes, actualizar la tabla automáticamente
        if (currentTab === 'pendiente_validacion') {
            loadOrders('pendiente_validacion', true); // Pasamos true para indicar que es refresco automático
        }
    }
    // Actualizamos el contador para la próxima vez
    lastPendingCount = pend;
}

// 🛑 LIMPIEZA MANUAL DE BLOQUEOS
window.liberarBloqueosManual = async function() {
    const sorteoId = document.getElementById('raffle-title').dataset.id;
    if(!sorteoId) return Swal.fire('Error', 'No hay sorteo activo.', 'error');

    Swal.fire({
        title: '¿Liberar bloqueos?',
        text: "Esto pondrá como 'disponible' todos los tickets que se quedaron trabados en el carrito de compra (estado 'bloqueado'). Úsalo si notas que el stock no se libera.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#f97316',
        confirmButtonText: 'Sí, liberar'
    }).then(async (result) => {
        if (result.isConfirmed) {
            // Buscamos tickets bloqueados de este sorteo
            const { data: ticketsBloqueados } = await supabaseClient
                .from('tickets')
                .select('id')
                .eq('id_sorteo', sorteoId)
                .eq('estado', 'bloqueado');

            if(ticketsBloqueados && ticketsBloqueados.length > 0) {
                const ids = ticketsBloqueados.map(t => t.id);
                await supabaseClient.from('tickets').update({ estado: 'disponible', id_orden: null }).in('id', ids);
                Swal.fire('Listo', `Se liberaron ${ticketsBloqueados.length} tickets.`, 'success');
                loadTicketStats(sorteoId);
            } else {
                Swal.fire('Info', 'No hay tickets bloqueados para liberar.', 'info');
            }
        }
    });
}

window.switchTab = function(tab) {
    currentTab = tab;
    ['pendiente_validacion', 'aprobado', 'rechazado'].forEach((t, i) => {
        const btn = document.getElementById(['tab-pendientes', 'tab-aprobados', 'tab-rechazados'][i]);
        if(t === tab) {
            btn.classList.add('border-b-2', 'border-indigo-600', 'text-indigo-600');
        } else {
            btn.classList.remove('border-b-2', 'border-indigo-600', 'text-indigo-600');
        }
    });
    loadOrders(tab);
}

// Modificamos esta función para aceptar un parámetro de "es refresco automático"
async function loadOrders(estado, isAutoRefresh = false) {
    const tbody = document.getElementById('orders-table-body');
    const raffleId = document.getElementById('raffle-title').dataset.id;

    if(!raffleId) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-12 text-slate-400">No hay sorteo activo. Crea uno nuevo para ver órdenes.</td></tr>`;
        return;
    }

    // Solo mostramos el spinner de carga si NO es un refresco automático (para que no parpadee feo)
    if (!isAutoRefresh) {
        if(tbody.innerHTML.includes('No hay registros') || tbody.innerHTML === '') {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center py-12"><i class="fa-solid fa-circle-notch fa-spin text-indigo-500 text-2xl"></i></td></tr>`;
        }
    }
    
    const { data: ordenes } = await supabaseClient
        .from('ordenes')
        .select('*')
        .eq('estado', estado)
        .eq('id_sorteo', raffleId) 
        .order('creado_en', { ascending: false });

    if (!ordenes || ordenes.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-12 text-slate-400">No hay registros en esta sección para el sorteo actual.</td></tr>`;
        return;
    }

    let html = '';
    ordenes.forEach(orden => {
        const fecha = new Date(orden.creado_en).toLocaleDateString('es-VE');
        let btns = '';

        if(estado === 'pendiente_validacion') {
            btns = `
                <button onclick="approveOrder('${orden.id}')" class="bg-emerald-100 text-emerald-700 p-2 rounded-lg hover:bg-emerald-200 transition" title="Aprobar"><i class="fa-solid fa-check"></i></button>
                <button onclick="rejectOrder('${orden.id}')" class="bg-rose-100 text-rose-700 p-2 rounded-lg hover:bg-rose-200 transition" title="Rechazar"><i class="fa-solid fa-times"></i></button>
                <button onclick="openEditModal('${orden.id}')" class="bg-slate-100 text-slate-600 p-2 rounded-lg hover:bg-slate-200 transition" title="Editar"><i class="fa-solid fa-pen"></i></button>
            `;
        } else if (estado === 'aprobado') {
            btns = `
                <a href="https://wa.me/${orden.telefono}" target="_blank" class="bg-green-100 text-green-700 p-2 rounded-lg hover:bg-green-200 transition" title="Whatsapp"><i class="fa-brands fa-whatsapp"></i></a>
                <button onclick="openEditModal('${orden.id}')" class="bg-slate-100 text-slate-600 p-2 rounded-lg hover:bg-slate-200 transition"><i class="fa-solid fa-pen"></i></button>
                <button onclick="rejectOrder('${orden.id}')" class="bg-red-50 text-red-500 p-2 rounded-lg hover:bg-red-100 transition" title="Liberar Tickets"><i class="fa-solid fa-ban"></i></button>
            `;
        } else {
             btns = `<button onclick="approveOrder('${orden.id}')" class="bg-indigo-100 text-indigo-700 p-2 rounded-lg hover:bg-indigo-200 transition" title="Reactivar"><i class="fa-solid fa-rotate-left"></i></button>`;
        }

        // Agregamos una pequeña animación fade-in a las filas
        html += `
            <tr class="bg-white hover:bg-slate-50 border-b border-slate-50 transition animate-[fadeIn_0.5s_ease-out]">
                <td class="px-6 py-4">
                    <p class="font-bold text-slate-800 text-sm uppercase">${orden.nombre}</p>
                    <p class="text-xs text-slate-400 font-mono">#${orden.id.slice(0,6)}</p>
                </td>
                <td class="px-6 py-4 text-xs text-slate-600">
                    <div>${orden.cedula}</div>
                    <div>${orden.telefono}</div>
                </td>
                <td class="px-6 py-4 text-center font-bold text-indigo-600 bg-indigo-50/50">${orden.cantidad_boletos}</td>
                <td class="px-6 py-4 font-bold text-slate-800">Bs. ${orden.monto_total}</td>
                <td class="px-6 py-4 font-mono text-xs">${orden.referencia_pago || '-'}</td>
                <td class="px-6 py-4 text-center">
                    ${orden.url_comprobante ? `<button onclick="viewProof('${orden.url_comprobante}')" class="text-indigo-500 hover:text-indigo-700"><i class="fa-solid fa-image text-xl"></i></button>` : '-'}
                </td>
                <td class="px-6 py-4 text-right space-x-1 whitespace-nowrap">
                    ${btns}
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
}

// LOGICA DE ORDENES (APROBAR/RECHAZAR/EDITAR)
window.approveOrder = async function(id) {
    if(!confirm("¿Aprobar orden?")) return;
    const { data: orden } = await supabaseClient.from('ordenes').select('cantidad_boletos').eq('id', id).single();
    const { count } = await supabaseClient.from('tickets').select('*', { count: 'exact', head: true }).eq('id_orden', id);
    
    if (count < orden.cantidad_boletos) {
         const raffleId = document.getElementById('raffle-title').dataset.id;
         const { data: newTickets } = await supabaseClient.from('tickets').select('id').eq('id_sorteo', raffleId).eq('estado', 'disponible').limit(orden.cantidad_boletos);
         if (newTickets.length < orden.cantidad_boletos) return Swal.fire('Error', 'Stock insuficiente', 'error');
         const ids = newTickets.map(t => t.id);
         await supabaseClient.from('tickets').update({ estado: 'vendido', id_orden: id }).in('id', ids);
    } else {
        await supabaseClient.from('tickets').update({ estado: 'vendido' }).eq('id_orden', id);
    }
    await supabaseClient.from('ordenes').update({ estado: 'aprobado' }).eq('id', id);
    loadDashboardData();
    Swal.fire('Aprobado', 'Orden procesada', 'success');
}

window.rejectOrder = async function(id) {
    if(!confirm("¿Rechazar orden y liberar sus tickets?")) return;
    
    // 1. Marcar orden como rechazada
    await supabaseClient.from('ordenes').update({ estado: 'rechazado' }).eq('id', id);
    
    // 2. Liberar los tickets asociados a esa orden
    await supabaseClient.from('tickets').update({ estado: 'disponible', id_orden: null }).eq('id_orden', id);
    
    loadDashboardData();
    loadTicketStats(document.getElementById('raffle-title').dataset.id); 
}

window.openEditModal = async function(id) {
    const { data: orden } = await supabaseClient.from('ordenes').select('*').eq('id', id).single();
    if (!orden) return;
    currentUnitPrice = orden.monto_total / orden.cantidad_boletos; if(isNaN(currentUnitPrice)) currentUnitPrice = 0;
    
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
            const raffleId = document.getElementById('raffle-title').dataset.id;
            const { data: newTickets } = await supabaseClient.from('tickets').select('id').eq('id_sorteo', raffleId).eq('estado', 'disponible').limit(nuevaCant);
            if (!newTickets || newTickets.length < nuevaCant) throw new Error("Stock insuficiente.");
            
            const { data: currentOrder } = await supabaseClient.from('ordenes').select('estado').eq('id', id).single();
            const nuevoEstadoTicket = currentOrder.estado === 'aprobado' ? 'vendido' : 'bloqueado';
            const ids = newTickets.map(t => t.id);
            await supabaseClient.from('tickets').update({ estado: nuevoEstadoTicket, id_orden: id }).in('id', ids);
        }

        await supabaseClient.from('ordenes').update(updates).eq('id', id);
        closeModal('modal-edit');
        loadDashboardData();
        Swal.fire('Guardado', 'Datos actualizados', 'success');
    } catch(e) { Swal.fire('Error', e.message, 'error'); }
}

window.viewProof = function(url) {
    document.getElementById('proof-image').src = url;
    document.getElementById('proof-download').href = url;
    document.getElementById('modal-proof').classList.remove('hidden');
}
window.closeModal = function(id) { document.getElementById(id).classList.add('hidden'); }
window.logout = async function() { await supabaseClient.auth.signOut(); window.location.href = 'admin_login.html'; }

// ==========================================
// 3. SORTEO ACTIVO (EDITAR)
// ==========================================

async function loadActiveRaffle() {
    const { data: sorteo } = await supabaseClient.from('sorteos').select('*').eq('estado', 'activo').single();
    if(sorteo) {
        document.getElementById('conf-id').value = sorteo.id;
        document.getElementById('conf-titulo').value = sorteo.titulo;
        document.getElementById('conf-loteria').value = sorteo.loteria;
        document.getElementById('conf-precio').value = sorteo.precio_boleto;
        document.getElementById('conf-fecha').value = sorteo.fecha_sorteo;
        document.getElementById('conf-estado').value = sorteo.estado;
        document.getElementById('conf-img-preview').src = sorteo.url_flyer || 'https://placehold.co/150x100?text=Sin+Imagen';
    }
}

window.saveActiveRaffle = async function() {
    const id = document.getElementById('conf-id').value;
    if(!id) return Swal.fire('Error', 'No hay sorteo activo para editar.', 'error');
    
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
            const { error: upErr } = await supabaseClient.storage.from('images').upload(fileName, file);
            if(upErr) throw upErr;
            const { data: publicUrl } = supabaseClient.storage.from('images').getPublicUrl(fileName);
            updates.url_flyer = publicUrl.publicUrl;
        }

        const { error } = await supabaseClient.from('sorteos').update(updates).eq('id', id);
        if(error) throw error;
        
        Swal.fire('Guardado', 'Configuración actualizada', 'success');
        if(updates.url_flyer) document.getElementById('conf-img-preview').src = updates.url_flyer;
        
    } catch(e) { console.error(e); Swal.fire('Error', e.message, 'error'); }
}

// ==========================================
// 4. NUEVO SORTEO (ZONA PELIGROSA)
// ==========================================

window.processNewRaffle = async function() {
    const titulo = document.getElementById('new-titulo').value;
    const precio = document.getElementById('new-precio').value;
    const fecha = document.getElementById('new-fecha').value;
    const rango = document.getElementById('new-rango-value').value; // USAMOS EL VALOR OCULTO
    const fileInput = document.getElementById('new-file');

    if(!titulo || !precio || !fecha) return Swal.fire('Faltan Datos', 'Completa título, precio y fecha', 'warning');
    if(fileInput.files.length === 0) return Swal.fire('Falta Flyer', 'Debes subir una imagen para el sorteo', 'warning');

    Swal.fire({
        title: '¿Crear nuevo sorteo?',
        text: `Esto archivará el actual y generará ${rango} tickets nuevos.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sí, crear',
        confirmButtonColor: '#dc2626'
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                Swal.fire({ title: 'Subiendo y Generando...', html: 'Por favor espera, esto puede tardar unos segundos.', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

                // 1. Subir Imagen
                const file = fileInput.files[0];
                const fileName = `flyer_new_${Date.now()}.${file.name.split('.').pop()}`;
                const { error: upErr } = await supabaseClient.storage.from('images').upload(fileName, file);
                if(upErr) throw upErr;
                const { data: publicUrl } = supabaseClient.storage.from('images').getPublicUrl(fileName);

                // 2. Archivar anterior
                await supabaseClient.from('sorteos').update({ estado: 'finalizado' }).eq('estado', 'activo');

                // 3. Crear nuevo
                const { data: newSorteo, error } = await supabaseClient.from('sorteos').insert([{
                    titulo,
                    precio_boleto: parseFloat(precio),
                    fecha_sorteo: fecha,
                    loteria: document.getElementById('new-loteria').value,
                    url_flyer: publicUrl.publicUrl,
                    estado: 'activo'
                }]).select().single();

                if(error) throw error;

                // 4. Generar tickets (Batch insert)
                const limit = parseInt(rango);
                const digits = limit === 100 ? 2 : (limit === 1000 ? 3 : 4);
                let tickets = [];
                const batchSize = 500;

                for(let i=0; i<limit; i++) {
                    tickets.push({
                        numero: i.toString().padStart(digits, '0'),
                        id_sorteo: newSorteo.id,
                        estado: 'disponible'
                    });

                    if(tickets.length >= batchSize) {
                        await supabaseClient.from('tickets').insert(tickets);
                        tickets = [];
                    }
                }
                if(tickets.length > 0) await supabaseClient.from('tickets').insert(tickets);

                Swal.fire('¡Éxito!', 'Nuevo sorteo creado y tickets generados.', 'success').then(() => {
                    location.reload();
                });

            } catch (e) {
                console.error(e);
                Swal.fire('Error', 'Hubo un error: ' + e.message, 'error');
            }
        }
    });
}

// ==========================================
// 5. MÉTODOS DE PAGO (FLEXIBLES)
// ==========================================

async function loadPaymentMethods() {
    const container = document.getElementById('payments-container');
    container.innerHTML = 'Cargando...';
    
    const { data: methods } = await supabaseClient.from('metodos_pago').select('*').order('id');
    
    if(!methods || methods.length === 0) {
        container.innerHTML = '<p class="col-span-3 text-center text-slate-400">No hay métodos configurados.</p>';
        return;
    }

    let html = '';
    methods.forEach(m => {
        const isChecked = m.activo ? 'checked' : '';
        const statusColor = m.activo ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200 opacity-70';
        
        // Renderizado dinámico de campos (Solo muestra lo que existe)
        let detailsHtml = '';
        if(m.titular) detailsHtml += `<p><span class="font-semibold text-slate-400 text-xs uppercase w-16 inline-block">Titular:</span> ${m.titular}</p>`;
        if(m.cedula) detailsHtml += `<p><span class="font-semibold text-slate-400 text-xs uppercase w-16 inline-block">ID:</span> ${m.cedula}</p>`;
        if(m.telefono) detailsHtml += `<p><span class="font-semibold text-slate-400 text-xs uppercase w-16 inline-block">Tel/Cta:</span> ${m.telefono}</p>`;

        html += `
            <div class="border rounded-xl p-5 relative transition-all ${statusColor}">
                <div class="flex justify-between items-start mb-3">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-full bg-white flex items-center justify-center text-slate-600 shadow-sm border border-slate-100">
                            <i class="fa-solid fa-building-columns"></i>
                        </div>
                        <div>
                            <h4 class="font-bold text-slate-800">${m.banco}</h4>
                            <p class="text-xs text-slate-500 uppercase">${m.tipo.replace('_', ' ')}</p>
                        </div>
                    </div>
                    
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" class="sr-only peer toggle-checkbox" ${isChecked} onchange="togglePaymentStatus(${m.id}, this.checked)">
                        <div class="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-indigo-300 rounded-full peer toggle-label peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                    </label>
                </div>

                <div class="space-y-1 text-sm text-slate-600 mb-4 bg-white/50 p-3 rounded-lg min-h-[80px]">
                    ${detailsHtml || '<p class="text-xs text-slate-400 italic">Solo información básica configurada.</p>'}
                </div>

                <div class="flex gap-2 justify-end">
                    <button onclick="editPaymentMethod(${m.id})" class="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg hover:bg-indigo-100 transition">Editar</button>
                    <button onclick="deletePaymentMethod(${m.id})" class="text-xs font-bold text-rose-600 bg-rose-50 px-3 py-1.5 rounded-lg hover:bg-rose-100 transition">Eliminar</button>
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
}

window.togglePaymentStatus = async function(id, isActive) {
    try {
        await supabaseClient.from('metodos_pago').update({ activo: isActive }).eq('id', id);
        const Toast = Swal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 1500 });
        Toast.fire({ icon: 'success', title: isActive ? 'Método activado' : 'Método desactivado' });
        loadPaymentMethods(); 
    } catch(e) { console.error(e); }
}

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
    const banco = document.getElementById('pay-banco').value;
    
    // Validación relajada: Solo exigimos el nombre del banco/método
    if(!banco) return Swal.fire('Error', 'Debes ingresar al menos el Nombre del Banco o Método.', 'warning');

    const data = {
        banco: banco,
        titular: document.getElementById('pay-titular').value,
        cedula: document.getElementById('pay-cedula').value,
        telefono: document.getElementById('pay-telefono').value,
        tipo: document.getElementById('pay-tipo').value,
        activo: true
    };

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

checkAuth();
