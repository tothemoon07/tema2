// admin_panel.js - VERSIÓN FINAL: SOPORTE PARA LOTES MASIVOS (4000+ TICKETS)

const SUPABASE_URL = 'https://tpzuvrvjtxuvmyusjmpq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRwenV2cnZqdHh1dm15dXNqbXBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1NDMwMDAsImV4cCI6MjA4MDExOTAwMH0.YcGZLy7W92H0o0TN4E_v-2PUDtcSXhB-D7x7ob6TTp4';

const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

let currentTab = 'pendiente_validacion';
let refreshInterval;
let currentUnitPrice = 0;
let lastPendingCount = -1; 
let timers = []; 

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
    ['dashboard', 'active-raffle', 'new-raffle', 'payments', 'winner'].forEach(v => {
        document.getElementById(`view-${v}`).classList.add('hidden');
        const nav = document.getElementById(`nav-${v}`);
        if(nav) nav.classList.remove('active');
    });

    document.getElementById(`view-${view}`).classList.remove('hidden');
    const activeNav = document.getElementById(`nav-${view}`);
    if(activeNav) activeNav.classList.add('active');

    if(window.innerWidth < 768) {
        document.getElementById('sidebar').classList.add('-translate-x-full');
    }

    if(view === 'dashboard') loadDashboardData();
    if(view === 'active-raffle') loadActiveRaffle();
    if(view === 'payments') loadPaymentMethods();
}

window.selectRange = function(value, btnElement) {
    document.getElementById('new-rango-value').value = value;
    document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('selected'));
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
            document.getElementById('raffle-title').dataset.id = sorteo.id;
            document.getElementById('raffle-title').dataset.precio = sorteo.precio_boleto; 
            
            loadTicketStats(sorteo.id);
            loadFinancialStats(sorteo.id);

            if(currentTab === 'bloqueado') {
                loadBlockedGroups(sorteo.id);
            } else {
                loadOrders(currentTab);
            }
            
            if (refreshInterval) clearInterval(refreshInterval);
            refreshInterval = setInterval(() => {
                loadTicketStats(sorteo.id);
                loadFinancialStats(sorteo.id);
                if(currentTab === 'bloqueado') loadBlockedGroups(sorteo.id, true);
            }, 5000); 

        } else {
             document.getElementById('raffle-title').innerText = "Sin sorteo activo";
             document.getElementById('raffle-id-display').innerText = "-";
             document.getElementById('orders-table-body').innerHTML = `<tr><td colspan="8" class="text-center py-12 text-slate-400">No hay sorteo activo.</td></tr>`;
        }
    } catch(e) { console.error(e); }
}

function safeSetText(id, text) { const el = document.getElementById(id); if (el) el.innerText = text; }

async function loadTicketStats(sorteoId) {
    if(!sorteoId) return;

    const { count: total } = await supabaseClient.from('tickets').select('*', { count: 'exact', head: true }).eq('id_sorteo', sorteoId);
    const { count: disp } = await supabaseClient.from('tickets').select('*', { count: 'exact', head: true }).eq('id_sorteo', sorteoId).eq('estado', 'disponible');
    const { count: vend } = await supabaseClient.from('tickets').select('*', { count: 'exact', head: true }).eq('id_sorteo', sorteoId).eq('estado', 'vendido');
    const { count: bloq } = await supabaseClient.from('tickets').select('*', { count: 'exact', head: true }).eq('id_sorteo', sorteoId).eq('estado', 'bloqueado');
    const { count: pend } = await supabaseClient.from('ordenes').select('*', { count: 'exact', head: true }).eq('estado', 'pendiente_validacion').eq('id_sorteo', sorteoId);
    
    safeSetText('stat-available', disp || 0); 
    safeSetText('stat-sold', vend || 0); 
    safeSetText('stat-pending', pend || 0);
    
    let porcentaje = 0;
    if (total > 0) {
        const ocupados = total - disp;
        porcentaje = ((ocupados / total) * 100).toFixed(2);
    }
    safeSetText('stat-percentage', porcentaje + '%');
    
    const bar = document.getElementById('stat-percent-bar');
    if(bar) bar.style.width = `${porcentaje}%`;
    safeSetText('stat-percent', porcentaje + '%');

    const blockedEl = document.getElementById('stat-blocked');
    if(blockedEl) {
        blockedEl.innerText = bloq || 0;
        blockedEl.className = bloq > 0 ? 'text-rose-500 font-bold text-2xl animate-pulse' : 'text-rose-500 font-bold text-2xl';
    }

    if (lastPendingCount !== -1 && pend > lastPendingCount) {
        const Toast = Swal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 4000, timerProgressBar: true });
        Toast.fire({ icon: 'success', title: '¡Nueva Orden Recibida!' });
        if (currentTab === 'pendiente_validacion') loadOrders('pendiente_validacion', true); 
    }
    lastPendingCount = pend;
}

async function loadFinancialStats(sorteoId) {
    if(!sorteoId) return;

    const { data: ventas, error } = await supabaseClient
        .from('ordenes')
        .select('monto_total, metodo_pago')
        .eq('id_sorteo', sorteoId)
        .eq('estado', 'aprobado');

    if (error) { console.error(error); return; }

    let totalBs = 0;
    let totalUsd = 0;

    ventas.forEach(v => {
        const esBolivares = v.metodo_pago === 'pago_movil' || v.metodo_pago === 'transferencia';
        if (esBolivares) {
            totalBs += v.monto_total;
        } else {
            totalUsd += v.monto_total; 
        }
    });

    safeSetText('stat-total-bs', `Bs. ${totalBs.toLocaleString('es-VE', {minimumFractionDigits: 2})}`);
    safeSetText('stat-total-usd', `$ ${totalUsd.toLocaleString('en-US', {minimumFractionDigits: 2})}`);
}

window.switchTab = function(tab) {
    currentTab = tab;
    ['pendiente_validacion', 'aprobado', 'rechazado', 'bloqueado'].forEach(t => {
        const btnId = t === 'bloqueado' ? 'tab-bloqueados' : 
                      (t === 'pendiente_validacion' ? 'tab-pendientes' : 
                      (t === 'aprobado' ? 'tab-aprobados' : 'tab-rechazados'));
        const btn = document.getElementById(btnId);
        
        if(t === tab) {
            btn.classList.add('border-b-2', 'border-indigo-600', 'text-indigo-600', 'bg-slate-50');
            if(t === 'bloqueado') btn.classList.replace('text-indigo-600', 'text-rose-600');
            if(t === 'bloqueado') btn.classList.replace('border-indigo-600', 'border-rose-600');
        } else {
            btn.classList.remove('border-b-2', 'border-indigo-600', 'text-indigo-600', 'text-rose-600', 'border-rose-600', 'bg-slate-50');
        }
    });

    const raffleId = document.getElementById('raffle-title').dataset.id;
    if(tab === 'bloqueado') {
        loadBlockedGroups(raffleId);
    } else {
        loadOrders(tab);
    }
}

// ==========================================
// LOGICA ESPECIAL: TICKETS BLOQUEADOS
// ==========================================

async function loadBlockedGroups(raffleId, isRefresh = false) {
    const tbody = document.getElementById('orders-table-body');
    if (!raffleId) return;

    timers.forEach(t => clearInterval(t));
    timers = [];

    if (!isRefresh) tbody.innerHTML = `<tr><td colspan="8" class="text-center py-12"><i class="fa-solid fa-circle-notch fa-spin text-rose-500 text-2xl"></i><p class="text-xs text-slate-400 mt-2">Buscando carritos activos...</p></td></tr>`;

    const { data: tickets } = await supabaseClient
        .from('tickets')
        .select('id, created_at, numero, user_id')
        .eq('id_sorteo', raffleId)
        .eq('estado', 'bloqueado')
        .order('created_at', { ascending: false });

    if (!tickets || tickets.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center py-12 text-slate-400">No hay compras en proceso actualmente.</td></tr>`;
        return;
    }

    const grupos = {};
    
    tickets.forEach(t => {
        const timeKey = new Date(t.created_at).toISOString().slice(0, 19); 
        const key = `${t.user_id}_${timeKey}`;
        
        if(!grupos[key]) {
            grupos[key] = {
                user_id: t.user_id,
                created_at: t.created_at,
                tickets: [],
                count: 0
            };
        }
        grupos[key].tickets.push(t);
        grupos[key].count++;
    });

    let html = '';
    const precioUnitario = parseFloat(document.getElementById('raffle-title').dataset.precio || 0);

    Object.values(grupos).forEach((grupo, index) => {
        const totalEstimado = grupo.count * precioUnitario;
        const uniqueId = `timer-${index}`;
        
        const createdAt = new Date(grupo.created_at).getTime();
        const now = Date.now();
        const expiresAt = createdAt + (20 * 60 * 1000); 
        let diff = expiresAt - now;

        html += `
            <tr class="bg-rose-50/30 border-b border-rose-100 animate-[fadeIn_0.5s_ease-out]">
                <td class="px-6 py-4">
                    <p class="font-bold text-slate-700 text-sm">Carrito Activo</p>
                    <p class="text-[10px] text-slate-400 font-mono">ID: ...${grupo.user_id.slice(-6)}</p>
                </td>
                <td class="px-6 py-4 text-xs text-slate-500 italic">
                    (Datos del cliente aún no guardados)
                </td>
                <td class="px-6 py-4 text-center font-bold text-rose-600 bg-rose-100/50 rounded-lg">
                    ${grupo.count} tickets
                </td>
                <td class="px-6 py-4 text-center">
                    <span id="${uniqueId}" class="font-mono font-bold text-rose-600 bg-white border border-rose-200 px-2 py-1 rounded text-xs shadow-sm">Calculando...</span>
                </td>
                <td class="px-6 py-4 font-bold text-slate-600">
                    Bs. ${totalEstimado.toLocaleString('es-VE')} (Est.)
                </td>
                <td class="px-6 py-4 text-center text-slate-300">-</td>
                <td class="px-6 py-4 text-center text-slate-300">-</td>
                <td class="px-6 py-4 text-right">
                    <button onclick="releaseBlockedGroup('${grupo.user_id}', '${grupo.created_at}')" class="bg-rose-500 text-white px-3 py-2 rounded-lg hover:bg-rose-600 transition shadow-md shadow-rose-200 text-xs font-bold">
                        <i class="fa-solid fa-trash-can mr-1"></i> Liberar
                    </button>
                </td>
            </tr>
        `;

        const timerId = setInterval(() => {
            const now = Date.now();
            const remaining = expiresAt - now;
            
            const el = document.getElementById(uniqueId);
            if(el) {
                if (remaining <= 0) {
                    el.innerText = "Expirado";
                    el.classList.add('bg-red-600', 'text-white');
                    clearInterval(timerId);
                    releaseBlockedGroup(grupo.user_id, grupo.created_at, true); 
                } else {
                    const m = Math.floor(remaining / 60000);
                    const s = Math.floor((remaining % 60000) / 1000);
                    el.innerText = `${m}:${s < 10 ? '0'+s : s}`;
                }
            }
        }, 1000);
        timers.push(timerId);
    });

    tbody.innerHTML = html;
}

window.releaseBlockedGroup = async function(userId, createdAt, isAuto = false) {
    if(!isAuto && !confirm("¿Estás seguro de liberar estos tickets? El usuario perderá su reserva.")) return;

    const raffleId = document.getElementById('raffle-title').dataset.id;
    
    const { error } = await supabaseClient
        .from('tickets')
        .update({ estado: 'disponible', user_id: null }) 
        .eq('id_sorteo', raffleId)
        .eq('user_id', userId)
        .eq('estado', 'bloqueado');

    if(!error) {
        if(!isAuto) Swal.fire('Liberado', 'Los tickets han vuelto al stock.', 'success');
        loadBlockedGroups(raffleId); 
        loadTicketStats(raffleId); 
    } else {
        console.error(error);
        if(!isAuto) Swal.fire('Error', 'No se pudieron liberar.', 'error');
    }
}

// ==========================================
// 3. CARGA DE ÓRDENES NORMALES
// ==========================================

async function loadOrders(estado, isAutoRefresh = false) {
    const tbody = document.getElementById('orders-table-body');
    const raffleId = document.getElementById('raffle-title').dataset.id;

    if(!raffleId) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center py-12 text-slate-400">No hay sorteo activo. Crea uno nuevo para ver órdenes.</td></tr>`;
        return;
    }

    if (!isAutoRefresh && estado !== 'bloqueado') {
        if(tbody.innerHTML.includes('No hay registros') || tbody.innerHTML === '') {
            tbody.innerHTML = `<tr><td colspan="8" class="text-center py-12"><i class="fa-solid fa-circle-notch fa-spin text-indigo-500 text-2xl"></i></td></tr>`;
        }
    }
    
    const { data: ordenes } = await supabaseClient
        .from('ordenes')
        .select('*')
        .eq('estado', estado)
        .eq('id_sorteo', raffleId) 
        .order('creado_en', { ascending: false });

    if (!ordenes || ordenes.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center py-12 text-slate-400">No hay registros en esta sección.</td></tr>`;
        return;
    }

    let html = '';
    ordenes.forEach(orden => {
        const fecha = new Date(orden.creado_en).toLocaleDateString('es-VE');
        const esPagoMovil = orden.metodo_pago === 'pago_movil' || orden.metodo_pago === 'transferencia';
        const simbolo = esPagoMovil ? 'Bs.' : '$';
        const metodoNombre = orden.metodo_pago.replace(/_/g, ' ').toUpperCase();
        const badgeColor = esPagoMovil ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-emerald-50 text-emerald-700 border-emerald-100';
        
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
                
                <td class="px-6 py-4 text-center">
                     <span class="px-2 py-1 rounded border text-[10px] font-bold ${badgeColor}">
                        ${metodoNombre}
                    </span>
                </td>

                <td class="px-6 py-4 font-bold text-slate-800">${simbolo} ${orden.monto_total.toLocaleString('es-VE', {minimumFractionDigits: 2})}</td>
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

// ==========================================
// AQUÍ ESTÁ EL CAMBIO IMPORTANTE: LOGICA DE LOTES
// ==========================================
window.approveOrder = async function(id) {
    if(!confirm("¿Aprobar orden?")) return;
    
    // Obtenemos la orden
    const { data: orden } = await supabaseClient.from('ordenes').select('cantidad_boletos').eq('id', id).single();
    
    // Verificamos si ya tiene tickets asignados (por si fue una aprobación directa sin pasar por rechazo)
    const { count } = await supabaseClient.from('tickets').select('*', { count: 'exact', head: true }).eq('id_orden', id);
    
    // Si NO tiene tickets asignados (caso: reactivar orden rechazada), hay que buscarlos
    if (count < orden.cantidad_boletos) {
         const raffleId = document.getElementById('raffle-title').dataset.id;
         
         // 1. Verificamos disponibilidad TOTAL primero para no fallar a la mitad
         const { count: totalDisponible } = await supabaseClient
            .from('tickets')
            .select('*', { count: 'exact', head: true })
            .eq('id_sorteo', raffleId)
            .eq('estado', 'disponible');

         if(totalDisponible < orden.cantidad_boletos) {
            return Swal.fire('Error', 'No hay suficientes tickets disponibles en el sistema para reactivar esta orden.', 'error');
         }

         // 2. PROCESAMIENTO POR LOTES (BATCHING)
         // Esto evita el error con órdenes grandes (ej: 4950 tickets)
         Swal.fire({ 
            title: 'Procesando...', 
            html: 'Asignando tickets masivos, por favor espera un momento.', 
            didOpen: () => Swal.showLoading(), 
            allowOutsideClick: false 
         });
         
         let remaining = orden.cantidad_boletos;
         const batchSize = 1000; // Supabase suele limitar a 1000 filas por defecto

         try {
             while(remaining > 0) {
                const take = Math.min(remaining, batchSize);
                
                // Pedimos un lote de IDs disponibles
                const { data: batchTickets, error: fetchError } = await supabaseClient
                    .from('tickets')
                    .select('id')
                    .eq('id_sorteo', raffleId)
                    .eq('estado', 'disponible')
                    .limit(take);

                if(fetchError || !batchTickets || batchTickets.length === 0) {
                     throw new Error("Error recuperando tickets durante el proceso.");
                }

                const ids = batchTickets.map(t => t.id);
                
                // Actualizamos este lote
                const { error: updateError } = await supabaseClient
                    .from('tickets')
                    .update({ estado: 'vendido', id_orden: id })
                    .in('id', ids);

                if(updateError) throw updateError;

                remaining -= ids.length; // Restamos lo procesado
             }
         } catch (e) {
             console.error(e);
             return Swal.fire('Error', 'Hubo un problema procesando los lotes: ' + e.message, 'error');
         }

    } else {
        // Lógica normal: Ya tiene tickets reservados (estado 'bloqueado' o similar), solo cambiamos estado
        await supabaseClient.from('tickets').update({ estado: 'vendido' }).eq('id_orden', id);
    }

    // Finalmente actualizamos la orden
    await supabaseClient.from('ordenes').update({ estado: 'aprobado' }).eq('id', id);
    
    loadDashboardData();
    Swal.fire('Aprobado', 'Orden procesada correctamente.', 'success');
}

window.rejectOrder = async function(id) {
    if(!confirm("¿Rechazar orden y liberar sus tickets?")) return;
    await supabaseClient.from('ordenes').update({ estado: 'rechazado' }).eq('id', id);
    await supabaseClient.from('tickets').update({ estado: 'disponible', id_orden: null }).eq('id_orden', id);
    loadDashboardData();
    loadTicketStats(document.getElementById('raffle-title').dataset.id); 
}

window.openEditModal = async function(id) {
    const { data: orden } = await supabaseClient.from('ordenes').select('*').eq('id', id).single();
    if (!orden) return;
    currentUnitPrice = orden.monto_total / orden.cantidad_boletos; if(isNaN(currentUnitPrice)) currentUnitPrice = 0;
    
    const esPagoMovil = orden.metodo_pago === 'pago_movil' || orden.metodo_pago === 'transferencia';
    const simbolo = esPagoMovil ? 'Bs.' : '$';

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
    document.getElementById('display-unit-price').innerText = `${simbolo} ${currentUnitPrice.toFixed(2)}`;
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
            if (!newTickets || newTickets.length < nuevaCant) throw new Error("Stock insuficiente para aumentar la cantidad.");
            
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

async function loadActiveRaffle() {
    const { data: sorteo } = await supabaseClient.from('sorteos').select('*').eq('estado', 'activo').single();
    if(sorteo) {
        document.getElementById('conf-id').value = sorteo.id;
        document.getElementById('conf-titulo').value = sorteo.titulo;
        document.getElementById('conf-loteria').value = sorteo.loteria;
        document.getElementById('conf-fecha').value = sorteo.fecha_sorteo;
        document.getElementById('conf-estado').value = sorteo.estado;
        
        document.getElementById('conf-precio-bs').value = sorteo.precio_boleto;
        document.getElementById('conf-min-bs').value = sorteo.min_compra_bs || 1;
        document.getElementById('conf-max-bs').value = sorteo.max_compra_bs || 500;

        document.getElementById('conf-precio-usd').value = sorteo.precio_usd || 0;
        document.getElementById('conf-min-usd').value = sorteo.min_compra_usd || 1;
        document.getElementById('conf-max-usd').value = sorteo.max_compra_usd || 100;
        
        document.getElementById('conf-img-preview').src = sorteo.url_flyer || 'https://placehold.co/150x100?text=Sin+Imagen';
    }
}

window.saveActiveRaffle = async function() {
    const id = document.getElementById('conf-id').value;
    if(!id) return Swal.fire('Error', 'No hay sorteo activo para editar.', 'error');
    
    const updates = {
        titulo: document.getElementById('conf-titulo').value,
        loteria: document.getElementById('conf-loteria').value,
        fecha_sorteo: document.getElementById('conf-fecha').value,
        estado: document.getElementById('conf-estado').value,
        
        precio_boleto: parseFloat(document.getElementById('conf-precio-bs').value),
        precio_usd: parseFloat(document.getElementById('conf-precio-usd').value),
        
        min_compra_bs: parseInt(document.getElementById('conf-min-bs').value),
        max_compra_bs: parseInt(document.getElementById('conf-max-bs').value),
        
        min_compra_usd: parseInt(document.getElementById('conf-min-usd').value),
        max_compra_usd: parseInt(document.getElementById('conf-max-usd').value)
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

window.processNewRaffle = async function() {
    const titulo = document.getElementById('new-titulo').value;
    const fecha = document.getElementById('new-fecha').value;
    const rango = document.getElementById('new-rango-value').value;
    
    const precioBs = document.getElementById('new-precio-bs').value;
    const minBs = document.getElementById('new-min-bs').value || 1;
    const maxBs = document.getElementById('new-max-bs').value || 500;
    
    const precioUsd = document.getElementById('new-precio-usd').value;
    const minUsd = document.getElementById('new-min-usd').value || 1;
    const maxUsd = document.getElementById('new-max-usd').value || 100;

    const fileInput = document.getElementById('new-file');

    if(!titulo || !precioBs || !fecha) return Swal.fire('Faltan Datos', 'Completa título, precios y fecha', 'warning');
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

                const file = fileInput.files[0];
                const fileName = `flyer_new_${Date.now()}.${file.name.split('.').pop()}`;
                const { error: upErr } = await supabaseClient.storage.from('images').upload(fileName, file);
                if(upErr) throw upErr;
                const { data: publicUrl } = supabaseClient.storage.from('images').getPublicUrl(fileName);

                await supabaseClient.from('sorteos').update({ estado: 'finalizado' }).eq('estado', 'activo');

                const { data: newSorteo, error } = await supabaseClient.from('sorteos').insert([{
                    titulo,
                    fecha_sorteo: fecha,
                    loteria: document.getElementById('new-loteria').value,
                    url_flyer: publicUrl.publicUrl,
                    estado: 'activo',
                    
                    precio_boleto: parseFloat(precioBs),
                    precio_usd: parseFloat(precioUsd),
                    
                    min_compra_bs: parseInt(minBs),
                    max_compra_bs: parseInt(maxBs),
                    
                    min_compra_usd: parseInt(minUsd),
                    max_compra_usd: parseInt(maxUsd),
                    total_tickets: parseInt(rango) 
                }]).select().single();

                if(error) throw error;

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

window.searchWinner = async function() {
    const input = document.getElementById('winner-search-input');
    const num = input.value.trim();
    const raffleId = document.getElementById('raffle-title').dataset.id;
    const raffleName = document.getElementById('raffle-title').innerText;

    if(!num) return Swal.fire('Error', 'Ingresa un número de ticket.', 'warning');

    Swal.fire({ title: 'Buscando...', didOpen: () => Swal.showLoading() });

    // 1. Buscar el Ticket
    const { data: ticket, error } = await supabaseClient
        .from('tickets')
        .select('*')
        .eq('numero', num)
        .eq('id_sorteo', raffleId)
        .single();

    if(error || !ticket) {
        return Swal.fire('No encontrado', `El ticket ${num} no existe en este sorteo.`, 'error');
    }

    if(ticket.estado !== 'vendido') {
        return Swal.fire('No vendido', `El ticket ${num} está ${ticket.estado.toUpperCase()}, no tiene dueño asignado.`, 'info');
    }

    // 2. Buscar datos de la Orden (Dueño)
    const { data: orden } = await supabaseClient
        .from('ordenes')
        .select('*')
        .eq('id', ticket.id_orden)
        .single();

    if(!orden) {
        return Swal.fire('Error de Datos', 'El ticket aparece vendido pero no encontramos la orden asociada.', 'error');
    }

    Swal.close();

    // 3. Rellenar la Tarjeta Compacta
    document.getElementById('card-number').innerText = num;
    document.getElementById('card-raffle-name').innerText = raffleName;
    document.getElementById('card-client-name').innerText = orden.nombre;
    document.getElementById('card-client-cedula').innerText = orden.cedula;
    document.getElementById('card-client-phone').innerText = orden.telefono;
    document.getElementById('card-client-email').innerText = orden.email;
    document.getElementById('card-client-method').innerText = orden.metodo_pago.replace('_', ' ');

    // 4. Configurar botón de WhatsApp
    const whatsappLink = `https://wa.me/${orden.telefono.replace(/\+/g, '')}`;
    document.getElementById('btn-contact-whatsapp').href = whatsappLink;

    // 5. Mostrar el contenedor
    document.getElementById('winner-result-container').classList.remove('hidden');
}

window.downloadWinnerCard = function() {
    const node = document.getElementById('winner-card-node');
    
    // Ocultar botón de descarga temporalmente para la foto
    const btn = node.querySelector('button');
    btn.style.display = 'none';

    html2canvas(node, { scale: 3, backgroundColor: null }).then(canvas => {
        const link = document.createElement('a');
        link.download = `Ganador_Ticket_${document.getElementById('card-number').innerText}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
        btn.style.display = 'block'; // Volver a mostrar el botón
    });
}

checkAuth();
