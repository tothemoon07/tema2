// admin_panel.js

// ⚠️ TUS DATOS SUPABASE
const SUPABASE_URL = 'https://tpzuvrvjtxuvmyusjmpq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRwenV2cnZqdHh1dm15dXNqbXBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1NDMwMDAsImV4cCI6MjA4MDExOTAwMH0.YcGZLy7W92H0o0TN4E_v-2PUDtcSXhB-D7x7ob6TTp4';

const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

// Variables Globales
let currentTab = 'pendiente_validacion'; 

// 1. VERIFICAR SESIÓN
async function checkAuth() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
        window.location.href = 'admin_login.html';
    } else {
        console.log("Sesión activa:", session.user.email);
        loadDashboardData();
    }
}

// 2. CARGAR DASHBOARD
async function loadDashboardData() {
    const { data: sorteo } = await supabaseClient.from('sorteos').select('*').eq('estado', 'activo').single();

    if (sorteo) {
        document.getElementById('raffle-title').textContent = sorteo.titulo;
        document.getElementById('stat-date').textContent = sorteo.fecha_sorteo;
        document.getElementById('stat-price').textContent = `${sorteo.precio_boleto} ${sorteo.moneda}`;
        document.getElementById('stat-lottery').textContent = sorteo.loteria;

        // Cargar Estadísticas
        loadTicketStats(sorteo.id);
        // Cargar Tabla
        loadOrders(currentTab);
    } else {
        alert("No hay ningún sorteo activo.");
    }
}

// 3. ESTADÍSTICAS (Actualizado para mostrar Pendientes)
async function loadTicketStats(sorteoId) {
    const { count: disponibles } = await supabaseClient.from('tickets').select('*', { count: 'exact', head: true }).eq('id_sorteo', sorteoId).eq('estado', 'disponible');
    const { count: vendidos } = await supabaseClient.from('tickets').select('*', { count: 'exact', head: true }).eq('id_sorteo', sorteoId).eq('estado', 'vendido');
    
    // Aquí sumamos 'bloqueado' y 'pendiente' para saber cuántos están en proceso
    const { count: pendientes } = await supabaseClient.from('tickets').select('*', { count: 'exact', head: true }).eq('id_sorteo', sorteoId).in('estado', ['bloqueado', 'pendiente']);

    document.getElementById('stat-available').textContent = disponibles || 0;
    document.getElementById('stat-sold').textContent = vendidos || 0;
    document.getElementById('stat-blocked').textContent = pendientes || 0;
}

// 4. TABS
window.switchTab = function(tabName) {
    currentTab = tabName;
    const tabs = ['pendiente_validacion', 'aprobado', 'rechazado'];
    const btnIds = ['tab-pendientes', 'tab-aprobados', 'tab-rechazados'];
    
    tabs.forEach((t, i) => {
        const btn = document.getElementById(btnIds[i]);
        if (t === tabName) {
            if(t === 'pendiente_validacion') btn.className = "flex-1 py-4 text-center font-bold border-b-4 border-gray-600 text-gray-800 bg-gray-50";
            if(t === 'aprobado') btn.className = "flex-1 py-4 text-center font-bold border-b-4 border-green-500 text-green-800 bg-green-50";
            if(t === 'rechazado') btn.className = "flex-1 py-4 text-center font-bold border-b-4 border-red-500 text-red-800 bg-red-50";
        } else {
            btn.className = "flex-1 py-4 text-center text-gray-500 hover:bg-gray-50 transition";
        }
    });
    loadOrders(tabName);
}

// 5. CARGAR ÓRDENES
async function loadOrders(estado) {
    const tableBody = document.getElementById('orders-table-body');
    tableBody.innerHTML = `<tr><td colspan="8" class="text-center py-8"><i class="fa-solid fa-spinner fa-spin text-2xl text-gray-400"></i></td></tr>`;

    const { data: ordenes, error } = await supabaseClient
        .from('ordenes')
        .select('*')
        .eq('estado', estado)
        .order('creado_en', { ascending: false });

    if (error || !ordenes || ordenes.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="8" class="text-center py-8 text-gray-400">No hay órdenes en esta categoría.</td></tr>`;
        return;
    }

    let html = '';
    ordenes.forEach(orden => {
        const fecha = new Date(orden.creado_en).toLocaleDateString('es-VE');
        const hora = new Date(orden.creado_en).toLocaleTimeString('es-VE', {hour: '2-digit', minute:'2-digit'});
        
        let acciones = '';
        // BOTONES DE ACCIÓN REALES
        if (estado === 'pendiente_validacion') {
            acciones = `
                <div class="flex justify-end gap-2">
                    <button onclick="approveOrder('${orden.id}')" title="Aprobar" class="bg-green-100 text-green-700 hover:bg-green-200 p-2 rounded transition"><i class="fa-solid fa-check"></i></button>
                    <button onclick="rejectOrder('${orden.id}')" title="Rechazar" class="bg-red-100 text-red-700 hover:bg-red-200 p-2 rounded transition"><i class="fa-solid fa-xmark"></i></button>
                </div>
            `;
        } else if (estado === 'aprobado') {
            acciones = `
                <div class="flex justify-end gap-2">
                    <a href="https://wa.me/${orden.telefono}?text=Hola ${orden.nombre}, tu pago ha sido aprobado! 🎟️" target="_blank" class="bg-green-500 text-white hover:bg-green-600 px-3 py-1 rounded text-xs flex items-center gap-1 transition"><i class="fa-brands fa-whatsapp"></i> Contactar</a>
                </div>
            `;
        }

        html += `
            <tr class="bg-white border-b hover:bg-gray-50 transition">
                <td class="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                    <span class="block text-xs text-gray-400">#${orden.id.slice(0, 6)}...</span>
                    <span class="text-xs">${fecha} ${hora}</span>
                </td>
                <td class="px-4 py-3">
                    <div class="font-bold text-gray-800">${orden.nombre}</div>
                    <div class="text-xs text-gray-500">${orden.cedula}</div>
                </td>
                <td class="px-4 py-3 text-xs">
                    <div>${orden.telefono}</div>
                    <div class="text-gray-400">${orden.email || '-'}</div>
                </td>
                <td class="px-4 py-3 text-center">
                    <span class="bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded">${orden.cantidad_boletos}</span>
                </td>
                <td class="px-4 py-3">
                    <div class="font-semibold text-gray-700">${orden.metodo_pago}</div>
                    <div class="text-xs text-gray-500 font-mono">Bs. ${orden.monto_total}</div>
                </td>
                <td class="px-4 py-3 font-mono text-gray-600">${orden.referencia_pago || 'N/A'}</td>
                <td class="px-4 py-3 text-center">
                    ${orden.url_comprobante ? `<button onclick="viewProof('${orden.url_comprobante}')" class="text-blue-600 hover:underline text-xs"><i class="fa-solid fa-eye"></i> Ver</button>` : '<span class="text-gray-300 text-xs">Sin foto</span>'}
                </td>
                <td class="px-4 py-3 text-right">
                    ${acciones}
                </td>
            </tr>
        `;
    });
    tableBody.innerHTML = html;
}

// 6. LÓGICA DE APROBACIÓN Y RECHAZO (CRÍTICO)

// Aprobar: Pone la orden en 'aprobado' y los tickets en 'vendido'
window.approveOrder = async function(ordenId) {
    if(!confirm("¿Confirmar pago y adjudicar tickets?")) return;

    try {
        // 1. Aprobar Orden
        const { error: err1 } = await supabaseClient.from('ordenes').update({ estado: 'aprobado' }).eq('id', ordenId);
        if(err1) throw err1;

        // 2. Marcar Tickets como Vendidos
        const { error: err2 } = await supabaseClient.from('tickets').update({ estado: 'vendido' }).eq('id_orden', ordenId);
        if(err2) throw err2;

        alert("Orden Aprobada con éxito");
        loadDashboardData();
    } catch (e) {
        console.error(e);
        alert("Error al aprobar");
    }
}

// Rechazar: Pone la orden en 'rechazado' y LIBERA los tickets para que otros compren
window.rejectOrder = async function(ordenId) {
    if(!confirm("¿Rechazar pago y liberar los tickets?")) return;

    try {
        // 1. Rechazar Orden
        const { error: err1 } = await supabaseClient.from('ordenes').update({ estado: 'rechazado' }).eq('id', ordenId);
        if(err1) throw err1;

        // 2. LIBERAR TICKETS (estado: disponible, sin dueño)
        const { error: err2 } = await supabaseClient.from('tickets')
            .update({ estado: 'disponible', id_orden: null })
            .eq('id_orden', ordenId);
        if(err2) throw err2;

        alert("Orden Rechazada y tickets liberados");
        loadDashboardData();
    } catch (e) {
        console.error(e);
        alert("Error al rechazar");
    }
}

// Utilidades
window.viewProof = function(url) {
    document.getElementById('proof-image').src = url;
    document.getElementById('proof-download').href = url;
    document.getElementById('modal-proof').classList.remove('hidden');
}
window.closeModal = function(id) { document.getElementById(id).classList.add('hidden'); }
window.logout = async function() { await supabaseClient.auth.signOut(); window.location.href = 'admin_login.html'; }

// Iniciar
checkAuth();
