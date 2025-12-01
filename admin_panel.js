// admin_panel.js

const SUPABASE_URL = 'https://tpzuvrvjtxuvmyusjmpq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRwenV2cnZqdHh1dm15dXNqbXBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1NDMwMDAsImV4cCI6MjA4MDExOTAwMH0.YcGZLy7W92H0o0TN4E_v-2PUDtcSXhB-D7x7ob6TTp4';

const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

let currentTab = 'pendiente_validacion';

async function checkAuth() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) window.location.href = 'admin_login.html';
    else loadDashboardData();
}

async function loadDashboardData() {
    const { data: sorteo } = await supabaseClient.from('sorteos').select('*').eq('estado', 'activo').single();
    if (sorteo) {
        document.getElementById('raffle-title').textContent = sorteo.titulo;
        document.getElementById('stat-date').textContent = sorteo.fecha_sorteo;
        document.getElementById('stat-price').textContent = `${sorteo.precio_boleto} ${sorteo.moneda}`;
        document.getElementById('stat-lottery').textContent = sorteo.loteria;
        loadTicketStats(sorteo.id);
        loadOrders(currentTab);
    }
}

async function loadTicketStats(sorteoId) {
    const { count: disponibles } = await supabaseClient.from('tickets').select('*', { count: 'exact', head: true }).eq('id_sorteo', sorteoId).eq('estado', 'disponible');
    // Contamos vendidos + pendientes como "ocupados" visualmente si quieres, o solo vendidos
    const { count: vendidos } = await supabaseClient.from('tickets').select('*', { count: 'exact', head: true }).eq('id_sorteo', sorteoId).eq('estado', 'vendido');
    const { count: pendientes } = await supabaseClient.from('tickets').select('*', { count: 'exact', head: true }).eq('id_sorteo', sorteoId).eq('estado', 'pendiente');
    
    document.getElementById('stat-available').textContent = disponibles || 0;
    document.getElementById('stat-sold').textContent = vendidos || 0;
    // Usamos el cuadro de bloqueados para mostrar los pendientes de validación
    document.getElementById('stat-blocked').textContent = pendientes || 0; 
}

window.switchTab = function(tabName) {
    currentTab = tabName;
    const tabs = ['pendiente_validacion', 'aprobado', 'rechazado'];
    const btnIds = ['tab-pendientes', 'tab-aprobados', 'tab-rechazados'];
    tabs.forEach((t, i) => {
        const btn = document.getElementById(btnIds[i]);
        btn.className = (t === tabName) 
            ? `flex-1 py-4 text-center font-bold border-b-4 border-${t === 'aprobado' ? 'green' : (t === 'rechazado' ? 'red' : 'gray')}-500 bg-${t === 'aprobado' ? 'green' : (t === 'rechazado' ? 'red' : 'gray')}-50`
            : "flex-1 py-4 text-center text-gray-500 hover:bg-gray-50 transition";
    });
    loadOrders(tabName);
}

async function loadOrders(estado) {
    const tableBody = document.getElementById('orders-table-body');
    tableBody.innerHTML = `<tr><td colspan="8" class="text-center py-8"><i class="fa-solid fa-spinner fa-spin text-2xl text-gray-400"></i></td></tr>`;

    const { data: ordenes, error } = await supabaseClient
        .from('ordenes')
        .select('*')
        .eq('estado', estado)
        .order('creado_en', { ascending: false });

    if (error || !ordenes.length) {
        tableBody.innerHTML = `<tr><td colspan="8" class="text-center py-8 text-gray-400">No hay órdenes en esta categoría.</td></tr>`;
        return;
    }

    let html = '';
    ordenes.forEach(orden => {
        const fecha = new Date(orden.creado_en).toLocaleDateString('es-VE');
        let acciones = '';

        if (estado === 'pendiente_validacion') {
            acciones = `
                <div class="flex justify-end gap-2">
                    <button onclick="approveOrder('${orden.id}')" class="bg-green-100 text-green-700 hover:bg-green-200 p-2 rounded"><i class="fa-solid fa-check"></i></button>
                    <button onclick="rejectOrder('${orden.id}')" class="bg-red-100 text-red-700 hover:bg-red-200 p-2 rounded"><i class="fa-solid fa-xmark"></i></button>
                </div>`;
        } else if (estado === 'aprobado') {
            acciones = `<a href="https://wa.me/${orden.telefono}?text=Tu pago ha sido aprobado!" target="_blank" class="bg-green-500 text-white px-3 py-1 rounded text-xs"><i class="fa-brands fa-whatsapp"></i> Chat</a>`;
        }

        html += `
            <tr class="bg-white border-b hover:bg-gray-50">
                <td class="px-4 py-3 text-xs">#${orden.id.slice(0,6)}<br>${fecha}</td>
                <td class="px-4 py-3 font-bold text-gray-800">${orden.nombre}<br><span class="text-xs font-normal text-gray-500">${orden.cedula}</span></td>
                <td class="px-4 py-3 text-xs">${orden.telefono}</td>
                <td class="px-4 py-3 text-center"><span class="bg-blue-100 text-blue-800 text-xs font-medium px-2 py-0.5 rounded">${orden.cantidad_boletos}</span></td>
                <td class="px-4 py-3 text-xs">${orden.metodo_pago}<br>Bs. ${orden.monto_total}</td>
                <td class="px-4 py-3 font-mono text-xs">${orden.referencia_pago}</td>
                <td class="px-4 py-3 text-center">${orden.url_comprobante ? `<button onclick="viewProof('${orden.url_comprobante}')" class="text-blue-600 text-xs underline">Ver</button>` : '-'}</td>
                <td class="px-4 py-3 text-right">${acciones}</td>
            </tr>`;
    });
    tableBody.innerHTML = html;
}

// --- LOGICA DE APROBACIÓN / RECHAZO ---

// APROBAR: Cambia orden a 'aprobado' y tickets a 'vendido'
window.approveOrder = async function(ordenId) {
    if(!confirm("¿Aprobar pago y confirmar tickets?")) return;

    // 1. Actualizar Orden
    await supabaseClient.from('ordenes').update({ estado: 'aprobado' }).eq('id', ordenId);
    
    // 2. Actualizar Tickets (que ya estaban asignados en 'pendiente')
    await supabaseClient.from('tickets').update({ estado: 'vendido' }).eq('id_orden', ordenId);

    loadOrders(currentTab);
    loadDashboardData();
}

// RECHAZAR: Cambia orden a 'rechazado' y LIBERA los tickets ('disponible')
window.rejectOrder = async function(ordenId) {
    if(!confirm("¿Rechazar pago y liberar tickets?")) return;

    // 1. Actualizar Orden
    await supabaseClient.from('ordenes').update({ estado: 'rechazado' }).eq('id', ordenId);

    // 2. Liberar Tickets (Quitar dueño y poner disponible)
    await supabaseClient.from('tickets')
        .update({ estado: 'disponible', id_orden: null })
        .eq('id_orden', ordenId);

    loadOrders(currentTab);
    loadDashboardData();
}

window.viewProof = function(url) {
    document.getElementById('proof-image').src = url;
    document.getElementById('modal-proof').classList.remove('hidden');
}
window.closeModal = function(id) { document.getElementById(id).classList.add('hidden'); }
window.logout = async function() { await supabaseClient.auth.signOut(); window.location.href = 'admin_login.html'; }

checkAuth();
