// admin_panel.js

// ⚠️ PEGA AQUÍ TUS DATOS DE SUPABASE (IGUAL QUE EN EL LOGIN)
const SUPABASE_URL = 'https://tpzuvrvjtxuvmyusjmpq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRwenV2cnZqdHh1dm15dXNqbXBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1NDMwMDAsImV4cCI6MjA4MDExOTAwMH0.YcGZLy7W92H0o0TN4E_v-2PUDtcSXhB-D7x7ob6TTp4';

const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

// Variables Globales
let currentTab = 'pendiente_validacion'; // Pestaña por defecto

// 1. VERIFICAR SESIÓN (Seguridad)
async function checkAuth() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
        window.location.href = 'admin_login.html'; // Si no hay sesión, fuera.
    } else {
        console.log("Sesión activa:", session.user.email);
        loadDashboardData(); // Si hay sesión, cargar todo.
    }
}

// 2. CARGAR DATOS DEL DASHBOARD
async function loadDashboardData() {
    // A. Cargar Info de la Rifa (El Sorteo Activo)
    const { data: sorteo, error } = await supabaseClient
        .from('sorteos')
        .select('*')
        .eq('estado', 'activo')
        .single();

    if (sorteo) {
        document.getElementById('raffle-title').textContent = sorteo.titulo;
        document.getElementById('stat-date').textContent = sorteo.fecha_sorteo; // Formato YYYY-MM-DD
        document.getElementById('stat-price').textContent = `${sorteo.precio_boleto} ${sorteo.moneda}`;
        document.getElementById('stat-lottery').textContent = sorteo.loteria;

        // B. Cargar Contadores (Tickets)
        loadTicketStats(sorteo.id);
        
        // C. Cargar Órdenes (Tabla)
        loadOrders(currentTab);
    } else {
        alert("No hay ningún sorteo activo. Crea uno en la base de datos.");
    }
}

// 3. CARGAR ESTADÍSTICAS DE TICKETS
async function loadTicketStats(sorteoId) {
    // Disponibles
    const { count: disponibles } = await supabaseClient
        .from('tickets')
        .select('*', { count: 'exact', head: true })
        .eq('id_sorteo', sorteoId)
        .eq('estado', 'disponible');

    // Vendidos (Órdenes aprobadas)
    // Nota: Es mejor contar tickets vendidos que órdenes, para exactitud
    const { count: vendidos } = await supabaseClient
        .from('tickets')
        .select('*', { count: 'exact', head: true })
        .eq('id_sorteo', sorteoId)
        .eq('estado', 'vendido');

    // Bloqueados (En proceso de compra 15m)
    const { count: bloqueados } = await supabaseClient
        .from('tickets')
        .select('*', { count: 'exact', head: true })
        .eq('id_sorteo', sorteoId)
        .eq('estado', 'bloqueado');

    // Actualizar HTML
    document.getElementById('stat-available').textContent = disponibles || 0;
    document.getElementById('stat-sold').textContent = vendidos || 0;
    document.getElementById('stat-blocked').textContent = bloqueados || 0;
}

// 4. CAMBIAR PESTAÑA (Tabs)
window.switchTab = function(tabName) {
    currentTab = tabName;
    
    // Actualizar estilos de botones
    const tabs = ['pendiente_validacion', 'aprobado', 'rechazado'];
    const btnIds = ['tab-pendientes', 'tab-aprobados', 'tab-rechazados'];
    
    tabs.forEach((t, i) => {
        const btn = document.getElementById(btnIds[i]);
        if (t === tabName) {
            // Estilos Activos según el color
            if(t === 'pendiente_validacion') btn.className = "flex-1 py-4 text-center font-bold border-b-4 border-gray-600 text-gray-800 bg-gray-50";
            if(t === 'aprobado') btn.className = "flex-1 py-4 text-center font-bold border-b-4 border-green-500 text-green-800 bg-green-50";
            if(t === 'rechazado') btn.className = "flex-1 py-4 text-center font-bold border-b-4 border-red-500 text-red-800 bg-red-50";
        } else {
            // Estilos Inactivos
            btn.className = "flex-1 py-4 text-center text-gray-500 hover:bg-gray-50 transition";
        }
    });

    // Recargar tabla
    loadOrders(tabName);
}

// 5. CARGAR TABLA DE ÓRDENES (Simulado por ahora)
async function loadOrders(estado) {
    const tableBody = document.getElementById('orders-table-body');
    tableBody.innerHTML = `<tr><td colspan="8" class="text-center py-8"><i class="fa-solid fa-spinner fa-spin text-2xl text-gray-400"></i></td></tr>`;

    // Consulta real a Supabase
    // Traemos 'pendiente_pago' también si estamos en pendientes, para ver los del timer (opcional, tu decidiste ver solo los que subieron capture)
    // Según tu flujo: "Pendientes" son los que llegaron al confeti (status: 'pendiente_validacion')
    
    let queryStatus = estado;
    
    const { data: ordenes, error } = await supabaseClient
        .from('ordenes')
        .select('*')
        .eq('estado', queryStatus)
        .order('creado_en', { ascending: false });

    if (error) {
        console.error("Error cargando órdenes", error);
        tableBody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-red-500">Error al cargar datos</td></tr>`;
        return;
    }

    if (!ordenes || ordenes.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="8" class="text-center py-8 text-gray-400">No hay órdenes en esta categoría.</td></tr>`;
        return;
    }

    // Renderizar Filas
    let html = '';
    ordenes.forEach(orden => {
        const fecha = new Date(orden.creado_en).toLocaleDateString('es-VE');
        const hora = new Date(orden.creado_en).toLocaleTimeString('es-VE', {hour: '2-digit', minute:'2-digit'});
        
        // Botones de acción según el estado
        let acciones = '';
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
                    <button class="text-gray-400 hover:text-gray-600"><i class="fa-solid fa-ellipsis-vertical px-2"></i></button>
                </div>
            `;
        }

        html += `
            <tr class="bg-white border-b hover:bg-gray-50 transition">
                <td class="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                    <span class="block text-xs text-gray-400">#${orden.id.slice(0, 8)}...</span>
                    <span class="text-xs">${fecha} ${hora}</span>
                </td>
                <td class="px-4 py-3">
                    <div class="font-bold text-gray-800">${orden.nombre}</div>
                    <div class="text-xs text-gray-500">CI: ${orden.cedula}</div>
                </td>
                <td class="px-4 py-3 text-xs">
                    <div class="flex items-center gap-1"><i class="fa-solid fa-phone text-gray-400"></i> ${orden.telefono}</div>
                    <div class="flex items-center gap-1 text-gray-400"><i class="fa-solid fa-envelope"></i> ${orden.email || '-'}</div>
                </td>
                <td class="px-4 py-3 text-center">
                    <span class="bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded">${orden.cantidad_boletos}</span>
                </td>
                <td class="px-4 py-3">
                    <div class="font-semibold text-gray-700">${orden.metodo_pago}</div>
                    <div class="text-xs text-gray-500 font-mono">Monto: ${orden.monto_total}</div>
                </td>
                <td class="px-4 py-3 font-mono text-gray-600">${orden.referencia_pago || 'N/A'}</td>
                <td class="px-4 py-3 text-center">
                    ${orden.url_comprobante ? 
                        `<button onclick="viewProof('${orden.url_comprobante}')" class="text-blue-600 hover:underline text-xs"><i class="fa-solid fa-eye"></i> Ver</button>` : 
                        `<span class="text-gray-300 text-xs">Sin foto</span>`
                    }
                </td>
                <td class="px-4 py-3 text-right">
                    ${acciones}
                </td>
            </tr>
        `;
    });
    tableBody.innerHTML = html;
}

// 6. FUNCIONES DE ACCIÓN (Modales y Lógica)
window.viewProof = function(url) {
    document.getElementById('proof-image').src = url;
    document.getElementById('proof-download').href = url;
    document.getElementById('modal-proof').classList.remove('hidden');
}

window.closeModal = function(id) {
    document.getElementById(id).classList.add('hidden');
}

window.logout = async function() {
    await supabaseClient.auth.signOut();
    window.location.href = 'admin_login.html';
}

// Iniciar
checkAuth();
