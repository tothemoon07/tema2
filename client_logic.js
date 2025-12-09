// client_logic.js - VERSIÓN FINAL CORREGIDA (LÍMITES + TIMER + ADMIN SYNC)

const SUPABASE_URL = 'https://tpzuvrvjtxuvmyusjmpq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRwenV2cnZqdHh1dm15dXNqbXBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1NDMwMDAsImV4cCI6MjA4MDExOTAwMH0.YcGZLy7W92H0o0TN4E_v-2PUDtcSXhB-D7x7ob6TTp4';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Variables Globales
let ticketsReservados = [];
let intervaloTimer;
let currentStep = 1;
let activeCurrency = 'Bs';
let selectedMethodData = null;
let totalTicketsSorteo = 10000; 

// ==========================================
// 1. CARGA DE DATOS (INIT)
// ==========================================

document.addEventListener("DOMContentLoaded", async () => {
    console.log("Iniciando sistema Pre-Generated Pool...");

    const { data: sorteo, error } = await supabaseClient
        .from('sorteos')
        .select('*')
        .eq('estado', 'activo')
        .single();

    if (sorteo) {
        if (sorteo.total_tickets) totalTicketsSorteo = sorteo.total_tickets;

        if(document.getElementById('raffle-id')) document.getElementById('raffle-id').value = sorteo.id;
        
        if(document.getElementById('price-bs')) document.getElementById('price-bs').value = sorteo.precio_boleto;
        if(document.getElementById('min-bs')) document.getElementById('min-bs').value = sorteo.min_compra_bs || 1;
        if(document.getElementById('max-bs')) document.getElementById('max-bs').value = sorteo.max_compra_bs || 500;

        if(document.getElementById('price-usd')) document.getElementById('price-usd').value = sorteo.precio_usd || 0;
        if(document.getElementById('min-usd')) document.getElementById('min-usd').value = sorteo.min_compra_usd || 1;
        if(document.getElementById('max-usd')) document.getElementById('max-usd').value = sorteo.max_compra_usd || 100;

        setText('landing-title', sorteo.titulo);
        setText('landing-date', new Date(sorteo.fecha_sorteo).toLocaleDateString());
        setText('landing-price-display', `Bs. ${sorteo.precio_boleto} / $${sorteo.precio_usd || 0}`);
        setText('landing-lottery', sorteo.loteria);

        if(sorteo.url_flyer) {
            const imgEl = document.getElementById('landing-image');
            if(imgEl) imgEl.src = sorteo.url_flyer;
        }
        updateFomoBar(sorteo.id);
    } else {
        setText('landing-title', "No hay sorteo activo");
        disablePurchaseButtons();
    }

    loadPaymentMethodsForWizard();
    limpiarBloqueosHuerfanos();
});

function setText(id, text) { const el = document.getElementById(id); if(el) el.innerText = text; }

// --- FUNCIONES HELPER ---

async function actualizarEnLotes(ids, updates) {
    const BATCH_SIZE = 50; 
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
        const batch = ids.slice(i, i + BATCH_SIZE);
        await supabaseClient.from('tickets').update(updates).in('id', batch);
    }
}

async function updateFomoBar(raffleId) {
    // Cuenta todo lo que NO está disponible (incluye bloqueado y vendido)
    const { count: vendidos } = await supabaseClient
        .from('tickets')
        .select('*', { count: 'exact', head: true })
        .eq('id_sorteo', raffleId)
        .neq('estado', 'disponible');

    if (totalTicketsSorteo > 0) {
        const porcentaje = ((vendidos / totalTicketsSorteo) * 100).toFixed(2); 
        const bar = document.getElementById('fomo-bar');
        const text = document.getElementById('fomo-text');
        if (bar) bar.style.width = `${porcentaje}%`;
        if (text) text.innerText = `Boletos vendidos ${porcentaje}% 🚀`;
    }
}

async function limpiarBloqueosHuerfanos() {
    try {
        const hace20min = new Date(Date.now() - 20 * 60 * 1000).toISOString();
        const { data: zombies } = await supabaseClient
            .from('tickets')
            .select('id')
            .eq('estado', 'bloqueado') // CORRECCIÓN: Busca 'bloqueado' para coincidir con Admin
            .lt('created_at', hace20min) 
            .is('id_orden', null);

        if(zombies && zombies.length > 0) {
            const ids = zombies.map(t => t.id);
            await actualizarEnLotes(ids, { estado: 'disponible', user_id: null });
            console.log(`🧹 ${zombies.length} tickets bloqueados liberados.`);
        }
    } catch (e) { console.warn("Auto-limpieza error silencioso:", e); }
}

window.addEventListener('beforeunload', function (e) {
    if (ticketsReservados.length > 0) {
        const ids = ticketsReservados.map(t => t.id);
        actualizarEnLotes(ids, { estado: 'disponible', user_id: null });
    }
});

// ==========================================
// 2. WIZARD Y UI
// ==========================================

async function loadPaymentMethodsForWizard() {
    const container = document.getElementById('payment-methods-list');
    if(!container) return;
    container.innerHTML = '<p class="text-center text-xs text-gray-400 animate-pulse">Cargando...</p>';
    const { data: methods } = await supabaseClient.from('metodos_pago').select('*').eq('activo', true);
    if(!methods || methods.length === 0) {
        container.innerHTML = '<p class="text-center text-xs text-red-400">No hay métodos de pago.</p>';
        return;
    }
    const icons = {
        'pago_movil': { icon: 'solar:smartphone-2-bold-duotone', color: 'text-blue-600', bg: 'bg-blue-50', label: 'Pago Móvil' },
        'transferencia': { icon: 'solar:bank-bold-duotone', color: 'text-green-600', bg: 'bg-green-50', label: 'Transferencia' },
        'binance': { icon: 'simple-icons:binance', color: 'text-yellow-500', bg: 'bg-yellow-50', label: 'Binance' },
        'zelle': { icon: 'simple-icons:zelle', color: 'text-purple-600', bg: 'bg-purple-50', label: 'Zelle' },
        'zinli': { icon: 'simple-icons:zinli', color: 'text-indigo-500', bg: 'bg-indigo-50', label: 'Zinli' },
        'default': { icon: 'solar:card-bold', color: 'text-gray-500', bg: 'bg-gray-100', label: 'Otro' }
    };
    let html = '';
    methods.forEach((m) => {
        const style = icons[m.tipo] || icons['default'];
        let logoHtml = `<iconify-icon icon="${style.icon}"></iconify-icon>`;
        let currencyLabel = (m.tipo === 'pago_movil' || m.tipo === 'transferencia') ? 'BS' : 'USD';
        const methodStr = encodeURIComponent(JSON.stringify(m));
        html += `
            <div onclick="selectMethod('${methodStr}', this)" class="method-card cursor-pointer border-2 border-gray-100 rounded-2xl p-4 flex items-center gap-4 transition-all bg-white relative mb-2 hover:border-red-200">
                <div class="w-12 h-12 ${style.bg} ${style.color} rounded-xl flex items-center justify-center text-2xl flex-shrink-0">
                    ${logoHtml}
                </div>
                <div class="flex-1">
                    <h4 class="font-bold text-gray-800 text-sm">${m.banco || style.label}</h4>
                    <p class="text-[10px] text-gray-400 font-bold uppercase">${currencyLabel}</p>
                </div>
                <div class="check-icon w-6 h-6 bg-red-500 rounded-full flex items-center justify-center text-white text-xs opacity-0 transform scale-50 transition-all absolute right-4">
                    <iconify-icon icon="mingcute:check-line"></iconify-icon>
                </div>
            </div>`;
    });
    container.innerHTML = html;
}

window.selectMethod = function(methodStr, card) {
    document.querySelectorAll('.method-card').forEach(c => {
        c.classList.remove('border-red-500', 'bg-red-50', 'method-selected');
        const check = c.querySelector('.check-icon');
        if(check) { check.classList.remove('opacity-100', 'scale-100'); check.classList.add('opacity-0', 'scale-50'); }
    });
    card.classList.add('border-red-500', 'bg-red-50', 'method-selected');
    const check = card.querySelector('.check-icon');
    if(check) { check.classList.remove('opacity-0', 'scale-50'); check.classList.add('opacity-100', 'scale-100'); }
    const method = JSON.parse(decodeURIComponent(methodStr));
    selectedMethodData = method;
    if (method.tipo === 'pago_movil' || method.tipo === 'transferencia') activeCurrency = 'Bs'; else activeCurrency = 'USD';
    document.getElementById('custom-qty').value = getMin();
    updateTotal();
}

function disablePurchaseButtons() {
    document.querySelectorAll('button[onclick="abrirModalCompra()"]').forEach(b => { 
        b.disabled = true; b.innerHTML = 'AGOTADO'; b.classList.replace('bg-red-500','bg-gray-400');
    });
}

window.selectQty = function(n, btn) {
    const min = getMin(); const max = getMax();
    if(n < min) { Swal.fire('Atención', `Mínimo: ${min}.`, 'info'); n = min; }
    if(n > max) { Swal.fire('Atención', `Máximo: ${max}.`, 'info'); n = max; }
    document.querySelectorAll('.qty-btn').forEach(b => b.classList.remove('qty-btn-selected'));
    btn.classList.add('qty-btn-selected');
    document.getElementById('custom-qty').value = n; 
    window.updateTotal(); 
}

window.changeQty = function(n) { 
    let val = parseInt(document.getElementById('custom-qty').value) || 0; 
    let min = getMin(); let max = getMax();
    val += n; 
    if(val < min) val = min;
    if(val > max) { val = max; Swal.fire('Tope', `Límite: ${max}.`, 'warning'); }
    document.getElementById('custom-qty').value = val; 
    window.updateTotal();
    document.querySelectorAll('.qty-btn').forEach(b => b.classList.remove('qty-btn-selected'));
}

function getPrice() { return activeCurrency === 'Bs' ? parseFloat(document.getElementById('price-bs').value) : parseFloat(document.getElementById('price-usd').value); }
function getMin() { return activeCurrency === 'Bs' ? parseInt(document.getElementById('min-bs').value) : parseInt(document.getElementById('min-usd').value); }
function getMax() { return activeCurrency === 'Bs' ? parseInt(document.getElementById('max-bs').value) : parseInt(document.getElementById('max-usd').value); }

window.updateTotal = function() {
    let val = parseInt(document.getElementById('custom-qty').value) || 1;
    let price = getPrice();
    let total = val * price;
    let symbol = activeCurrency === 'Bs' ? 'Bs. ' : '$ ';
    let text = symbol + total.toLocaleString('es-VE', {minimumFractionDigits: 2});
    ['step2-total', 'step4-total', 'success-total'].forEach(id => { const el = document.getElementById(id); if(el) el.innerText = text; });
    const hint = document.getElementById('currency-limits-hint');
    if(hint) hint.innerText = `Límites (${activeCurrency}): ${getMin()} - ${getMax()}`;
}

window.abrirModalCompra = function() {
    if(document.querySelector('button[onclick="abrirModalCompra()"]').disabled) return;
    document.getElementById('checkoutModal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    currentStep = 1;
    window.mostrarPaso(1);
}

window.cerrarModalCompra = async function() {
    if (document.getElementById('step-success') && !document.getElementById('step-success').classList.contains('hidden')) { location.reload(); return; }
    if(ticketsReservados.length > 0) await liberarTickets();
    document.getElementById('checkoutModal').classList.add('hidden');
    document.body.style.overflow = 'auto';
}

window.mostrarPaso = function(paso) {
    for(let i=1; i<=5; i++) { const el = document.getElementById(`step-${i}`); if(el) el.classList.add('hidden'); }
    const stepEl = document.getElementById(`step-${paso}`);
    if(stepEl) stepEl.classList.remove('hidden');
    if(paso === 2) window.updateTotal();
    if(paso === 4) renderPaymentDetails();
    window.updateModalHeader();
}

window.updateModalHeader = function() {
    const titles = ["Método de Pago", "Cantidad", "Tus Datos", "Pago", "Confirmar"];
    const icons = ["solar:card-bold-duotone", "solar:ticket-bold-duotone", "solar:user-bold-duotone", "solar:bill-check-bold-duotone", "solar:upload-track-bold-duotone"];
    document.getElementById('header-title').innerText = titles[currentStep - 1] || "Finalizar";
    document.getElementById('header-step').innerText = `Paso ${currentStep} de 5`;
    document.getElementById('header-icon').setAttribute('icon', icons[currentStep - 1] || "solar:check-circle-bold");
    document.getElementById('progress-bar').style.width = `${currentStep * 20}%`;
    const btnBack = document.getElementById('btn-back');
    if(btnBack) { btnBack.disabled = (currentStep === 1); btnBack.classList.toggle('opacity-50', currentStep === 1); }
    const btnNext = document.getElementById('btn-next');
    if(btnNext) {
        btnNext.innerHTML = (currentStep === 5) ? `Finalizar <iconify-icon icon="solar:check-circle-bold"></iconify-icon>` : `Continuar <iconify-icon icon="solar:arrow-right-bold"></iconify-icon>`;
    }
}

window.prevStep = function() { if (currentStep > 1) { currentStep--; window.mostrarPaso(currentStep); } }

// ==========================================
// 3. VALIDACIÓN DE STOCK Y RESERVA
// ==========================================

async function validarStockReal() {
    const raffleId = document.getElementById('raffle-id').value;
    const cantidad = parseInt(document.getElementById('custom-qty').value);
    
    // CORRECCIÓN LÍMITES: Leemos los límites justo ahora para asegurar que sean de la moneda actual
    const min = getMin(); 
    const max = getMax();

    if (cantidad < min) { Swal.fire('Atención', `La compra mínima para ${activeCurrency} es de ${min} boletos.`, 'warning'); return false; }
    if (cantidad > max) { Swal.fire('Atención', `La compra máxima para ${activeCurrency} es de ${max} boletos.`, 'warning'); return false; }
    
    if (!raffleId || cantidad <= 0) return false;

    if(ticketsReservados.length > 0) await liberarTickets();

    const { count: disponibles, error } = await supabaseClient
        .from('tickets')
        .select('*', { count: 'exact', head: true })
        .eq('id_sorteo', raffleId)
        .eq('estado', 'disponible');

    if (disponibles < cantidad) { 
        window.mostrarAlertaStock(cantidad, disponibles); 
        return false; 
    }

    return await reservarTicketsEnDB(cantidad, raffleId);
}

// 🔥 NÚCLEO: RESERVAR TICKETS 🔥
async function reservarTicketsEnDB(cantidadSolicitada, raffleId) {
    const { data: { session } } = await supabaseClient.auth.getSession();
    const userId = session?.user?.id || '00000000-0000-0000-0000-000000000000'; 
    
    ticketsReservados = [];

    console.log(`Reservando ${cantidadSolicitada} tickets del pool...`);

    try {
        const { data, error } = await supabaseClient.rpc('reservar_tickets_automaticos', { 
            p_raffle_id: raffleId, 
            p_user_id: userId,
            p_cantidad: cantidadSolicitada,
            p_total_tickets: totalTicketsSorteo
        });

        if (error) {
            console.error("Error RPC:", error);
            Swal.fire('Error', 'Error al asignar tickets.', 'error');
            return false;
        }

        if (!data.success) {
            console.warn("Fallo en BD:", data.message);
            Swal.fire('Stock Limitado', data.message, 'warning');
            return false;
        }

        ticketsReservados = data.tickets || [];
        console.log(`Asignados exitosamente: ${ticketsReservados.length}`);
        return true;

    } catch (err) {
        console.error("Error crítico:", err);
        Swal.fire('Error', 'Error de conexión.', 'error');
        return false;
    }
}

window.mostrarAlertaStock = function(pedidos, disponibles) {
    document.getElementById('stock-pedido-val').innerText = pedidos;
    document.getElementById('stock-disponible-val').innerText = Math.max(0, disponibles);
    document.getElementById('modal-stock-sutil').classList.remove('hidden');
}
window.cerrarAlertaStock = function() { document.getElementById('modal-stock-sutil').classList.add('hidden'); }

// ==========================================
// 4. CONTROL DE PASOS
// ==========================================

window.nextStep = async function() {
    if(currentStep === 1) {
        if(!selectedMethodData) { Swal.fire({ icon: 'warning', text: 'Elige un método.' }); return; }
    }
    else if(currentStep === 2) {
        // PASO 2: CANTIDAD -> RESERVAR
        const btn = document.getElementById('btn-next');
        const oldText = btn.innerHTML;
        btn.innerHTML = 'Asignando... <iconify-icon icon="line-md:loading-loop" class="animate-spin"></iconify-icon>'; 
        btn.disabled = true;
        
        const check = await validarStockReal();
        
        btn.innerHTML = oldText; btn.disabled = false;
        if (!check) return; 

        // CORRECCIÓN TIMER: Inicia aquí porque ya tenemos los tickets
        iniciarTimer();
    }
    else if(currentStep === 3) {
        const name = document.getElementById('input-name').value;
        const cedula = document.getElementById('input-cedula').value;
        const phone = document.getElementById('input-phone').value;
        if(!name || !cedula || !phone) { Swal.fire({ icon: 'warning', text: 'Faltan datos.' }); return; }
        // Ya no iniciamos timer aquí
    }
    else if (currentStep === 5) {
        procesarCompraFinal();
        return;
    }
    if (currentStep < 5) { currentStep++; window.mostrarPaso(currentStep); }
};

function iniciarTimer() {
    clearInterval(intervaloTimer);
    let timeLeft = 1200; 
    document.getElementById('timer-container').classList.remove('hidden');
    intervaloTimer = setInterval(() => {
        let min = Math.floor(timeLeft / 60); let sec = timeLeft % 60;
        document.getElementById('countdown').innerText = `${min}:${sec < 10 ? '0'+sec : sec}`;
        if (timeLeft <= 0) {
            clearInterval(intervaloTimer);
            liberarTickets();
            Swal.fire({ title: 'Tiempo Agotado', text: 'Boletos liberados al pool.', icon: 'error' }).then(() => location.reload());
        }
        timeLeft--;
    }, 1000);
}

async function liberarTickets() {
    if (ticketsReservados.length === 0) return;
    const ids = ticketsReservados.map(t => t.id);
    await actualizarEnLotes(ids, { estado: 'disponible', user_id: null });
    ticketsReservados = [];
}

// ==========================================
// 5. RENDERIZADO DE PAGO Y FINALIZAR
// ==========================================

function renderPaymentDetails() {
    const m = selectedMethodData;
    const container = document.getElementById('payment-details-view');
    let html = `<div class="bg-gray-50 border border-gray-200 rounded-xl p-6 text-center shadow-sm">
        <h4 class="font-bold text-gray-800 text-lg mb-4 uppercase">${m.banco}</h4>
        <div class="space-y-3 text-sm text-gray-600">`;
    if(m.titular) html += `<div class="flex justify-between border-b border-gray-100 pb-2"><span>Titular:</span> <span class="font-bold select-all">${m.titular}</span></div>`;
    if(m.cedula) html += `<div class="flex justify-between border-b border-gray-100 pb-2"><span>ID/Cédula:</span> <span class="font-bold select-all">${m.cedula}</span></div>`;
    if(m.telefono) html += `<div class="flex justify-between border-b border-gray-100 pb-2"><span>Tel/Cuenta:</span> <span class="font-bold select-all text-lg text-gray-800">${m.telefono}</span></div>`;
    html += `</div><div class="mt-4 pt-2"><button onclick="copiarTexto('${m.telefono}')" class="text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold py-2 px-4 rounded-lg transition">Copiar Número</button></div></div>`;
    container.innerHTML = html;
}

window.copiarTexto = function(texto) {
    navigator.clipboard.writeText(texto).then(() => {
        const Toast = Swal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 1500 });
        Toast.fire({ icon: 'success', title: 'Copiado' });
    });
}

window.previewImage = function(input) {
    if (input.files && input.files[0]) {
        document.getElementById('upload-placeholder').classList.add('hidden');
        document.getElementById('file-preview').classList.remove('hidden');
    }
}

async function procesarCompraFinal() {
    const ref = document.getElementById('input-referencia').value;
    const fileInput = document.getElementById('input-comprobante');
    
    if (!ref || ref.length < 4 || !fileInput.files.length) { Swal.fire('Error', 'Faltan datos de pago.', 'warning'); return; }

    Swal.fire({ title: 'Enviando...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        const file = fileInput.files[0];
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${file.name.split('.').pop()}`;
        const { error: upErr } = await supabaseClient.storage.from('comprobantes').upload(fileName, file);
        if (upErr) throw upErr;
        const { data: { publicUrl } } = supabaseClient.storage.from('comprobantes').getPublicUrl(fileName);

        const precioUnitario = getPrice();
        const cantidad = parseInt(document.getElementById('custom-qty').value);
        const montoFinal = precioUnitario * cantidad;
        const raffleId = document.getElementById('raffle-id').value;

        // 1. Crear la Orden
        const { data: orden, error } = await supabaseClient.from('ordenes').insert([{
            id_sorteo: raffleId,
            nombre: document.getElementById('input-name').value,
            cedula: document.getElementById('input-cedula').value,
            telefono: document.getElementById('input-country-code').value + document.getElementById('input-phone').value,
            email: document.getElementById('input-email').value,
            metodo_pago: selectedMethodData.tipo, 
            referencia_pago: ref,
            url_comprobante: publicUrl,
            monto_total: montoFinal,
            cantidad_boletos: cantidad,
            estado: 'pendiente_validacion'
        }]).select().single();

        if (error) throw error;

        // 2. Actualizar Tickets a "pendiente"
        const ids = ticketsReservados.map(t => t.id);
        const numeros = ticketsReservados.map(t => t.numero);
        
        await actualizarEnLotes(ids, { estado: 'pendiente', id_orden: orden.id });

        ticketsReservados = [];
        clearInterval(intervaloTimer);
        Swal.close();

        // UI Final
        let numerosHtml = '';
        if(numeros.length > 20) {
            numerosHtml = numeros.slice(0, 20).map(n => `<span class="bg-red-100 text-red-700 font-bold px-3 py-1 rounded-lg text-sm border border-red-200">${n}</span>`).join('') + `<span class="text-xs text-gray-500 font-bold ml-2">... y ${numeros.length - 20} más.</span>`;
        } else {
             numerosHtml = numeros.map(n => `<span class="bg-red-100 text-red-700 font-bold px-3 py-1 rounded-lg text-sm border border-red-200">${n}</span>`).join('');
        }

        document.getElementById('assigned-tickets').innerHTML = numerosHtml;
        document.getElementById('modal-footer').classList.add('hidden');
        document.getElementById('step-5').classList.add('hidden');
        document.getElementById('step-success').classList.remove('hidden');
        confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });

    } catch (err) {
        console.error(err);
        Swal.fire('Error', 'Error enviando orden. Intenta de nuevo.', 'error');
    }
}

// ==========================================
// 6. EXTRAS (Menú, Consultas)
// ==========================================
window.toggleMenu = function() {
    const menu = document.getElementById('side-menu');
    const overlay = document.getElementById('menu-overlay');
    menu.classList.toggle('menu-open');
    overlay.classList.toggle('hidden');
    document.body.style.overflow = menu.classList.contains('menu-open') ? 'hidden' : 'auto';
}
window.menuAction = function(action) {
    window.toggleMenu(); 
    document.getElementById('view-home').classList.add('hidden');
    document.getElementById('view-terms').classList.add('hidden');
    window.scrollTo(0,0);
    if (action === 'home') document.getElementById('view-home').classList.remove('hidden');
    if (action === 'terms') document.getElementById('view-terms').classList.remove('hidden');
    if (action === 'verify') { document.getElementById('view-home').classList.remove('hidden'); window.abrirModalVerificar(); }
}
window.navigateTo = function(view) { window.menuAction(view); }
window.abrirModalVerificar = function() { document.getElementById('checkTicketsModal').classList.remove('hidden'); }
window.cerrarModalVerificar = function() { document.getElementById('checkTicketsModal').classList.add('hidden'); }

window.consultarTicketsReales = async function() {
    const cedulaInput = document.getElementById('cedula-consult');
    const cedula = cedulaInput ? cedulaInput.value : '';
    if(!cedula) return Swal.fire('Error', 'Ingresa tu cédula', 'warning');
    const div = document.getElementById('ticket-results');
    div.innerHTML = '<p class="text-center text-gray-400 py-4">Buscando...</p>';
    div.classList.remove('hidden');
    const { data: ordenes } = await supabaseClient.from('ordenes').select('*').eq('cedula', cedula).order('created_at', {ascending:false});
    if(!ordenes || ordenes.length === 0) {
        div.innerHTML = '<p class="text-center text-gray-400 p-4">No se encontraron compras.</p>'; return;
    }
    let html = '';
    for (let orden of ordenes) {
        const { data: tickets } = await supabaseClient.from('tickets').select('numero').eq('id_orden', orden.id).limit(20);
        let nums = tickets ? tickets.map(t => `<span class="bg-gray-100 px-1 rounded border">${t.numero}</span>`).join(' ') : 'Pendientes';
        if(orden.cantidad_boletos > 20) nums += ` <span class="text-[10px] text-gray-400">(+${orden.cantidad_boletos - 20})</span>`;
        let color = orden.estado === 'aprobado' ? 'green' : (orden.estado === 'rechazado' ? 'red' : 'yellow');
        let estado = orden.estado === 'aprobado' ? 'APROBADO' : (orden.estado === 'rechazado' ? 'RECHAZADO' : 'VERIFICANDO');
        html += `
            <div class="bg-white rounded-xl p-3 border border-gray-100 shadow-sm relative overflow-hidden mb-2">
                <div class="absolute top-0 right-0 w-4 h-full bg-${color}-500"></div>
                <div class="pr-6">
                    <div class="flex justify-between mb-1">
                        <span class="font-bold text-xs">#${orden.id.slice(0,6)}</span>
                        <span class="text-[10px] font-bold text-${color}-600 bg-${color}-50 px-2 rounded">${estado}</span>
                    </div>
                    <p class="text-[10px] text-gray-400 mb-2">${new Date(orden.created_at).toLocaleDateString()}</p>
                    <div class="flex flex-wrap gap-1 text-xs font-mono font-bold text-gray-700">${nums}</div>
                </div>
            </div>`;
    }
    div.innerHTML = html;
}
