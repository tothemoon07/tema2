// admin_panel.js - DISEÑO MEJORADO TIPO EXCEL

// ⚠️ DATOS DE SUPABASE
const SUPABASE_URL = 'https://tpzuvrvjtxuvmyusjmpq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRwenV2cnZqdHh1dm15dXNqbXBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1NDMwMDAsImV4cCI6MjA4MDExOTAwMH0.YcGZLy7W92H0o0TN4E_v-2PUDtcSXhB-D7x7ob6TTp4';

const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

// Variables Globales
let currentTab = 'pendiente_validacion'; 
let refreshInterval;

function safeSetText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

// 1. VERIFICAR SESIÓN
async function checkAuth() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
         window.location.href = 'admin_login.html';
    } else {
        console.log("Sesión activa:", session.user.email);
        loadDashboardData();
        
        if (refreshInterval) clearInterval(refreshInterval);
        refreshInterval = setInterval(() => {
            const sorteoIdElement = document.getElementById('raffle-title'); 
            if(sorteoIdElement && sorteoIdElement.dataset.id) {
                loadTicketStats(sorteoIdElement.dataset.id);
            }
        }, 10000); 
    }
}

// 2. CARGAR DASHBOARD
async function loadDashboardData() {
    try {
        const { data: sorteo, error } = await supabaseClient.from('sorteos').select('*').eq('estado', 'activo').single();

        if (sorteo) {
            const titleEl = document.getElementById('raffle-title');
            if (titleEl) {
                titleEl.textContent = sorteo.titulo;
                titleEl.dataset.id = sorteo.id; 
            }

            safeSetText('stat-date', sorteo.fecha_sorteo);
            safeSetText('stat-price', `${sorteo.precio_boleto} ${sorteo.moneda}`);
            safeSetText('stat-lottery', sorteo.loteria);

            loadTicketStats(sorteo.id);
            loadOrders(currentTab);
        }
    } catch (e) {
        console.error("Error cargando dashboard:", e);
    }
}

// 3. ESTADÍSTICAS
async function loadTicketStats(sorteoId) {
    try {
        const { count: disponibles } = await supabaseClient.from('tickets').select('*', { count: 'exact', head: true }).eq('id_sorteo', sorteoId).eq('estado', 'disponible');
        const { count: vendidos } = await supabaseClient.from('tickets').select('*', { count: 'exact', head: true }).eq('id_sorteo', sorteoId).eq('estado', 'vendido');
        const { count: ticketsBloqueados } = await supabaseClient.from('tickets').select('*', { count: 'exact', head: true }).eq('id_sorteo', sorteoId).eq('estado', 'bloqueado');
        const { count: ordenesPendientes } = await supabaseClient.from('ordenes').select('*', { count: 'exact', head: true }).eq('estado', 'pendiente_validacion');

        safeSetText('stat-available', disponibles || 0);
        safeSetText('stat-sold', vendidos || 0);
        safeSetText('stat-blocked', ticketsBloqueados || 0);
        safeSetText('stat-pending', ordenesPendientes || 0);

    } catch (e) { console.error("Error stats:", e); }
}

// 4. TABS
window.switchTab = function(tabName) {
    currentTab = tabName;
    const tabs = ['pendiente_validacion', 'aprobado', 'rechazado'];
    const btnIds = ['tab-pendientes', 'tab-aprobados', 'tab-rechazados'];
    
    tabs.forEach((t, i) => {
        const btn = document.getElementById(btnIds[i]);
        if (btn) {
            if (t === tabName) {
                btn.classList.add('border-b-4', 'font-bold', 'bg-gray-50');
                if(t === 'pendiente_validacion') btn.classList.add('border-gray-600', 'text-gray-800');
                if(t === 'aprobado') btn.classList.add('border-green-500', 'text-green-800');
                if(t === 'rechazado') btn.classList.add('border-red-500', 'text-red-800');
            } else {
                btn.className = "flex-1 py-4 text-center text-gray-500 hover:bg-gray-50 transition cursor-pointer";
            }
        }
    });
    loadOrders(tabName);
}

// 5. CARGAR ÓRDENES (Estilo Detallado / Excel)
async function loadOrders(estado) {
    const tableBody = document.getElementById('orders-table-body');
    if (!tableBody) return;

    // Spinner para 12 columnas
    tableBody.innerHTML = `<tr><td colspan="12" class="text-center py-8"><i class="fa-solid fa-spinner fa-spin text-2xl text-gray-400"></i></td></tr>`;

    const { data: ordenes, error } = await supabaseClient
        .from('ordenes')
        .select('*')
        .eq('estado', estado)
        .order('creado_en', { ascending: false });

    if (error || !ordenes || ordenes.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="12" class="text-center py-8 text-gray-400">No hay órdenes en esta categoría.</td></tr>`;
        return;
    }

    let html = '';
    ordenes.forEach(orden => {
        const fechaObj = new Date(orden.creado_en);
        const fechaStr = fechaObj.toLocaleDateString('es-VE');
        const horaStr = fechaObj.toLocaleTimeString('es-VE', {hour: '2-digit', minute:'2-digit'});
        
        let acciones = '';
        if (estado === 'pendiente_validacion') {
            acciones = `
                <div class="flex justify-end gap-2">
                    <button onclick="approveOrder('${orden.id}')" title="Aprobar" class="bg-green-100 text-green-600 hover:bg-green-600 hover:text-white h-8 w-8 rounded flex items-center justify-center transition shadow-sm border border-green-200"><i class="fa-solid fa-check"></i></button>
                    <button onclick="rejectOrder('${orden.id}')" title="Rechazar" class="bg-red-100 text-red-600 hover:bg-red-600 hover:text-white h-8 w-8 rounded flex items-center justify-center transition shadow-sm border border-red-200"><i class="fa-solid fa-xmark"></i></button>
                </div>
            `;
        } else if (estado === 'aprobado') {
            acciones = `
                <div class="flex justify-end gap-2">
                    <a href="https://wa.me/${orden.telefono}?text=Hola ${orden.nombre}, tu pago ha sido aprobado!" target="_blank" class="text-green-600 hover:text-green-800 font-bold text-xs flex items-center gap-1"><i class="fa-brands fa-whatsapp"></i> Chat</a>
                </div>
            `;
        }

        // --- FILAS DETALLADAS ---
        html += `
            <tr class="bg-white border-b hover:bg-blue-50 transition text-sm text-gray-700">
                
                <td class="px-4 py-3 whitespace-nowrap text-xs font-mono text-gray-400">
                    #${orden.id.slice(0, 6)}
                </td>

                <td class="px-4 py-3 font-bold text-gray-900 whitespace-nowrap uppercase">
                    ${orden.nombre}
                </td>

                <td class="px-4 py-3 whitespace-nowrap">
                    <span class="text-blue-600 font-medium bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                        ${orden.telefono}
                    </span>
                </td>

                <td class="px-4 py-3 whitespace-nowrap text-blue-600 underline text-xs">
                    <a href="mailto:${orden.email}">${orden.email || '-'}</a>
                </td>

                <td class="px-4 py-3 text-gray-500 whitespace-nowrap font-mono text-xs">
                    ${orden.cedula}
                </td>

                <td class="px-4 py-3 text-center">
                    <span class="bg-gray-100 text-gray-800 text-xs font-bold px-2 py-1 rounded">${orden.cantidad_boletos}</span>
                </td>

                <td class="px-4 py-3 whitespace-nowrap text-xs">
                    ${orden.metodo_pago}
                </td>

                <td class="px-4 py-3 whitespace-nowrap font-bold text-gray-800">
                    Bs. ${orden.monto_total}
                </td>

                <td class="px-4 py-3 font-mono text-xs whitespace-nowrap text-gray-600">
                    ${orden.referencia_pago || 'N/A'}
                </td>

                <td class="px-4 py-3 text-center">
                    ${orden.url_comprobante 
                        ? `<button onclick="viewProof('${orden.url_comprobante}')" class="text-blue-600 font-bold hover:text-blue-800 text-xs flex items-center justify-center gap-1 mx-auto"><i class="fa-regular fa-image"></i> Ver</button>` 
                        : '<span class="text-gray-300 text-xs">-</span>'}
                </td>

                <td class="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                    ${fechaStr} <span class="text-[10px] ml-1 text-gray-400">${horaStr}</span>
                </td>

                <td class="px-4 py-3 text-right sticky right-0 bg-white z-10 group-hover:bg-blue-50">
                    ${acciones}
                </td>
            </tr>
        `;
    });
    tableBody.innerHTML = html;
}

// 6. ACCIONES
window.approveOrder = async function(ordenId) {
    if(!confirm("¿Confirmar pago y adjudicar tickets?")) return;
    try {
        const { error: err1 } = await supabaseClient.from('ordenes').update({ estado: 'aprobado' }).eq('id', ordenId);
        if(err1) throw err1;
        const { error: err2 } = await supabaseClient.from('tickets').update({ estado: 'vendido' }).eq('id_orden', ordenId);
        if(err2) throw err2;
        alert("Orden Aprobada"); loadDashboardData();
    } catch (e) { alert("Error: " + e.message); }
}

window.rejectOrder = async function(ordenId) {
    if(!confirm("¿Rechazar pago y liberar los tickets?")) return;
    try {
        const { error: err1 } = await supabaseClient.from('ordenes').update({ estado: 'rechazado' }).eq('id', ordenId);
        if(err1) throw err1;
        const { error: err2 } = await supabaseClient.from('tickets').update({ estado: 'disponible', id_orden: null }).eq('id_orden', ordenId);
        if(err2) throw err2;
        alert("Orden Rechazada"); loadDashboardData();
    } catch (e) { alert("Error: " + e.message); }
}

// Utilidades
window.viewProof = function(url) {
    const img = document.getElementById('proof-image');
    const dl = document.getElementById('proof-download');
    const modal = document.getElementById('modal-proof');
    if(img) img.src = url;
    if(dl) dl.href = url;
    if(modal) modal.classList.remove('hidden');
}
window.closeModal = function(id) { document.getElementById(id).classList.add('hidden'); }
window.logout = async function() { await supabaseClient.auth.signOut(); window.location.href = 'admin_login.html'; }

checkAuth();
