// client_logic.js - FLUJO 5 PASOS + MULTI-MONEDA

const SUPABASE_URL = 'https://tpzuvrvjtxuvmyusjmpq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRwenV2cnZqdHh1dm15dXNqbXBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1NDMwMDAsImV4cCI6MjA4MDExOTAwMH0.YcGZLy7W92H0o0TN4E_v-2PUDtcSXhB-D7x7ob6TTp4';

const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

// Variables Globales
let currentStep = 1; 
let ticketsReservados = []; 
let intervaloTimer = null;
let activeRaffle = null;
let selectedCurrency = 'BS'; // 'BS' o 'USD'
let selectedMethodData = null; // Guardará el objeto del método seleccionado

// ==========================================
// 1. CARGA INICIAL
// ==========================================

window.onload = async function() {
    console.log("Iniciando sistema...");
    limpiarBloqueosHuerfanos();

    // Cargar Sorteo
    const { data: sorteo } = await supabaseClient.from('sorteos').select('*').eq('estado', 'activo').single();

    if (sorteo) {
        activeRaffle = sorteo;
        document.getElementById('raffle-id').value = sorteo.id;
        
        // Cargar Config BS
        document.getElementById('price-bs').value = sorteo.precio_boleto;
        document.getElementById('min-bs').value = sorteo.min_compra || 1;
        document.getElementById('max-bs').value = sorteo.max_compra || 100;
        
        // Cargar Config USD
        document.getElementById('price-usd').value = sorteo.precio_usd || 1; // Default por seguridad
        document.getElementById('min-usd').value = sorteo.min_compra_usd || 1;
        document.getElementById('max-usd').value = sorteo.max_compra_usd || 100;

        // Visuales Home
        setText('landing-title', sorteo.titulo);
        setText('landing-price-display', `Bs. ${sorteo.precio_boleto.toFixed(2)} / $${(sorteo.precio_usd || 0).toFixed(2)}`);
        setText('landing-date', sorteo.fecha_sorteo);
        setText('landing-lottery', sorteo.loteria);
        if(sorteo.url_flyer) document.getElementById('landing-image').src = sorteo.url_flyer;

    } else {
        setText('landing-title', "No hay sorteo activo");
        disablePurchaseButtons();
    }

    // Cargar Métodos para Paso 1
    loadPaymentMethodsStep1();
};

function setText(id, text) { const el = document.getElementById(id); if(el) el.innerText = text; }

// ==========================================
// 2. MÉTODOS DE PAGO (PASO 1)
// ==========================================

async function loadPaymentMethodsStep1() {
    const container = document.getElementById('method-selection-list');
    if(!container) return;
    
    container.innerHTML = '<p class="text-center text-xs text-gray-400 animate-pulse">Cargando...</p>';
    const { data: methods } = await supabaseClient.from('metodos_pago').select('*').eq('activo', true);
    
    if(!methods || methods.length === 0) {
        container.innerHTML = '<p class="text-center text-xs text-red-400">No hay métodos disponibles.</p>'; return;
    }

    let html = '';
    methods.forEach(m => {
        // Lógica de íconos y moneda
        let icon = 'solar:card-bold';
        let currencyLabel = 'USD';
        let colorClass = 'text-gray-500 bg-gray-50';
        
        if (m.tipo === 'pago_movil' || m.tipo === 'transferencia') {
            currencyLabel = 'Bolívares (Bs)';
            if (m.tipo === 'pago_movil') {
                // Usamos un ícono que se parezca o la imagen si tuviéramos URL
                icon = 'solar:smartphone-2-bold-duotone'; 
                colorClass = 'text-blue-600 bg-blue-50';
            } else {
                icon = 'solar:bank-bold-duotone';
                colorClass = 'text-green-600 bg-green-50';
            }
        } else {
            // Dólares
            if(m.tipo === 'binance') { icon = 'simple-icons:binance'; colorClass = 'text-yellow-500 bg-yellow-50'; }
            if(m.tipo === 'zelle') { icon = 'simple-icons:zelle'; colorClass = 'text-purple-600 bg-purple-50'; }
            if(m.tipo === 'zinli') { icon = 'simple-icons:zinli'; colorClass = 'text-indigo-500 bg-indigo-50'; }
        }

        // Stringify del objeto para pasarlo al click
        const methodString = encodeURIComponent(JSON.stringify(m));

        html += `
            <div onclick="selectMethod('${methodString}', this)" class="method-card cursor-pointer border-2 border-gray-100 rounded-2xl p-4 flex items-center gap-4 transition-all bg-white relative">
                <div class="w-12 h-12 ${colorClass} rounded-xl flex items-center justify-center text-2xl flex-shrink-0">
                    <iconify-icon icon="${icon}"></iconify-icon>
                </div>
                <div class="flex-1">
                    <h4 class="font-bold text-gray-800 text-sm">${m.banco || m.tipo.toUpperCase()}</h4>
                    <p class="text-[10px] text-gray-400 font-bold uppercase">${currencyLabel}</p>
                </div>
                <div class="check-icon w-6 h-6 bg-red-500 rounded-full flex items-center justify-center text-white text-xs opacity-0 transform scale-50 transition-all">
                    <iconify-icon icon="mingcute:check-line"></iconify-icon>
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
}

window.selectMethod = function(methodStr, card) {
    // 1. Visual Selection
    document.querySelectorAll('.method-card').forEach(c => c.classList.remove('method-selected'));
    card.classList.add('method-selected');

    // 2. Logic Selection
    const method = JSON.parse(decodeURIComponent(methodStr));
    selectedMethodData = method;

    // 3. Set Currency
    if (method.tipo === 'pago_movil' || method.tipo === 'transferencia') {
        selectedCurrency = 'BS';
    } else {
        selectedCurrency = 'USD';
    }

    // 4. Update Qty Input Defaults based on Currency Limits
    const min = getLimit('min');
    document.getElementById('custom-qty').value = min;
    updateTotal();

    console.log("Moneda seleccionada:", selectedCurrency, "Min:", min);
}

function getLimit(type) { // type: 'min', 'max', 'price'
    if (selectedCurrency === 'BS') {
        return parseFloat(document.getElementById(`${type}-bs`).value);
    } else {
        return parseFloat(document.getElementById(`${type}-usd`).value);
    }
}

// ==========================================
// 3. LÓGICA DE CANTIDAD (ADAPTADA)
// ==========================================

window.selectQty = function(n, btn) {
    const min = getLimit('min');
    const max = getLimit('max');

    if(n < min) { Swal.fire('Atención', `Mínimo ${min} boletos con este método.`, 'info'); n = min; }
    if(n > max) { Swal.fire('Atención', `Máximo ${max} boletos con este método.`, 'info'); n = max; }

    document.querySelectorAll('.qty-btn').forEach(b => b.classList.remove('qty-btn-selected'));
    btn.classList.add('qty-btn-selected');
    document.getElementById('custom-qty').value = n; 
    updateTotal(); 
}

window.changeQty = function(n) { 
    let val = parseInt(document.getElementById('custom-qty').value) || 0; 
    const min = getLimit('min');
    const max = getLimit('max');

    val += n; 
    
    if(val < min) { val = min; }
    if(val > max) { val = max; Swal.fire('Máximo alcanzado', `Límite de ${max} boletos.`, 'warning'); }
    
    document.getElementById('custom-qty').value = val; 
    updateTotal();
    document.querySelectorAll('.qty-btn').forEach(b => b.classList.remove('qty-btn-selected'));
}

window.updateTotal = function() {
    let val = parseInt(document.getElementById('custom-qty').value) || 1;
    let price = getLimit('price');
    let total = val * price;
    
    let symbol = selectedCurrency === 'BS' ? 'Bs. ' : '$ ';
    let text = symbol + total.toLocaleString('es-VE', {minimumFractionDigits: 2});
    
    document.getElementById('step2-total').innerText = text;
    document.getElementById('step4-total').innerText = text;
    document.getElementById('success-total').innerText = text;
    
    document.getElementById('currency-label').innerText = selectedCurrency === 'BS' ? 'BOLÍVARES' : 'DÓLARES (USD)';
}

// ==========================================
// 4. MODALES Y NAVEGACIÓN (WIZARD 5 PASOS)
// ==========================================

window.abrirModalCompra = function() {
    const btn = document.querySelector('button[onclick="abrirModalCompra()"]');
    if(btn && btn.disabled) return;
    document.getElementById('checkoutModal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    currentStep = 1;
    window.mostrarPaso(1);
}

window.cerrarModalCompra = async function() {
    if (document.getElementById('step-success') && !document.getElementById('step-success').classList.contains('hidden')) {
        location.reload(); return;
    }
    if(ticketsReservados.length > 0) await liberarTickets();
    document.getElementById('checkoutModal').classList.add('hidden');
    document.body.style.overflow = 'auto';
}

window.mostrarPaso = function(paso) {
    for(let i=1; i<=5; i++) {
        document.getElementById(`step-${i}`).classList.add('hidden');
    }
    document.getElementById(`step-${paso}`).classList.remove('hidden');
    window.updateModalHeader();
}

window.updateModalHeader = function() {
    const titles = ["Elige Método", "Cantidad", "Tus Datos", "Realizar Pago", "Confirmar"];
    const icons = ["solar:card-2-bold-duotone", "solar:ticket-bold-duotone", "solar:user-bold-duotone", "solar:wallet-money-bold-duotone", "solar:upload-track-bold-duotone"];
    
    let visualStep = currentStep;
    if(currentStep === 6) visualStep = 5; 
    
    document.getElementById('header-title').innerText = titles[currentStep - 1] || "Finalizar";
    document.getElementById('header-step').innerText = `Paso ${visualStep} de 5`;
    document.getElementById('header-icon').setAttribute('icon', icons[currentStep - 1] || "solar:check-circle-bold");
    document.getElementById('progress-bar').style.width = `${visualStep * 20}%`;

    const btnBack = document.getElementById('btn-back');
    const btnNext = document.getElementById('btn-next');
    
    btnBack.disabled = (currentStep === 1);
    btnBack.classList.toggle('opacity-50', currentStep === 1);

    if(currentStep === 5) {
        btnNext.innerHTML = `Finalizar <iconify-icon icon="solar:check-circle-bold"></iconify-icon>`;
    } else {
        btnNext.innerHTML = `Continuar <iconify-icon icon="solar:arrow-right-bold"></iconify-icon>`;
    }
}

window.prevStep = function() {
    if (currentStep > 1) {
        currentStep--;
        window.mostrarPaso(currentStep);
    }
}

// ==========================================
// 5. CONTROL DE FLUJO (NEXT STEP)
// ==========================================

window.nextStep = async function() {
    
    // PASO 1: MÉTODO DE PAGO
    if(currentStep === 1) {
        if(!selectedMethodData) { Swal.fire('Error', 'Selecciona un método de pago.', 'warning'); return; }
    }

    // PASO 2: CANTIDAD (VALIDAR STOCK)
    else if(currentStep === 2) {
        const btn = document.getElementById('btn-next');
        btn.innerHTML = 'Verificando...'; btn.disabled = true;
        const check = await validarStockReal();
        btn.innerHTML = 'Continuar <iconify-icon icon="solar:arrow-right-bold"></iconify-icon>'; btn.disabled = false;
        if (!check) return; 
    }

    // PASO 3: DATOS (INICIAR TIMER AQUÍ)
    else if(currentStep === 3) {
        const name = document.getElementById('input-name').value;
        const cedula = document.getElementById('input-cedula').value;
        const phone = document.getElementById('input-phone').value;
        if(!name || !cedula || !phone) { Swal.fire({ icon: 'warning', text: 'Completa todos los datos.' }); return; }
        
        iniciarTimer(); // 🔥 EL TIMER INICIA AQUÍ AHORA
        mostrarDatosPagoEnPaso4(); // Preparamos el paso 4
    }

    // PASO 4: PAGO (SOLO MOSTRAR, EL USUARIO DA CLICK PARA IR A SUBIR)
    else if (currentStep === 4) {
        // Solo avanza, no hay validación aquí, solo visualización
    }

    // PASO 5: FINALIZAR
    else if (currentStep === 5) {
        procesarCompraFinal();
        return;
    }

    currentStep++;
    window.mostrarPaso(currentStep);
};

// ==========================================
// 6. FUNCIONES DE STOCK Y TIMER
// ==========================================

async function validarStockReal() {
    const raffleId = document.getElementById('raffle-id').value;
    const cantidad = parseInt(document.getElementById('custom-qty').value);
    const min = getLimit('min');
    const max = getLimit('max');

    if (cantidad < min) { Swal.fire('Error', `Mínimo ${min} boletos.`, 'error'); return false; }
    if (cantidad > max) { Swal.fire('Error', `Máximo ${max} boletos.`, 'error'); return false; }

    const { count, error } = await supabaseClient
        .from('tickets').select('*', { count: 'exact', head: true })
        .eq('id_sorteo', raffleId).eq('estado', 'disponible');

    if (count < cantidad) { window.mostrarAlertaStock(cantidad, count); return false; }

    // Reservar
    const { data: tickets } = await supabaseClient.from('tickets').select('id, numero').eq('id_sorteo', raffleId).eq('estado', 'disponible').limit(cantidad);
    if (!tickets || tickets.length < cantidad) { Swal.fire('Error', 'Alguien ganó los boletos por velocidad.', 'warning'); return false; }
    
    const ids = tickets.map(t => t.id);
    await supabaseClient.from('tickets').update({ estado: 'bloqueado' }).in('id', ids);
    ticketsReservados = tickets;
    return true;
}

function iniciarTimer() {
    clearInterval(intervaloTimer);
    let timeLeft = 900; 
    document.getElementById('timer-container').classList.remove('hidden');
    intervaloTimer = setInterval(() => {
        let min = Math.floor(timeLeft / 60);
        let sec = timeLeft % 60;
        const el = document.getElementById('countdown');
        if(el) el.innerText = `${min}:${sec < 10 ? '0'+sec : sec}`;
        if (timeLeft <= 0) {
            clearInterval(intervaloTimer);
            liberarTickets();
            Swal.fire({ title: 'Tiempo Agotado', text: 'Boletos liberados.', icon: 'error' }).then(() => location.reload());
        }
        timeLeft--;
    }, 1000);
}

// ==========================================
// 7. MOSTRAR DATOS DE PAGO (PASO 4)
// ==========================================

function mostrarDatosPagoEnPaso4() {
    const container = document.getElementById('payment-details-view');
    const m = selectedMethodData;
    if(!m) return;

    let html = `
        <div class="text-center mb-4">
            <h4 class="font-bold text-lg text-gray-800">${m.banco}</h4>
            <span class="bg-gray-200 text-gray-600 text-[10px] font-bold px-2 py-1 rounded uppercase">${m.tipo.replace('_',' ')}</span>
        </div>
        <div class="space-y-3 text-sm border-t border-gray-200 pt-4">
    `;

    if(m.titular) html += `<div class="flex justify-between"><span>Titular:</span> <span class="font-bold select-all">${m.titular}</span></div>`;
    if(m.cedula) html += `
        <div class="flex justify-between items-center">
            <span>ID/Cédula:</span> 
            <div class="flex items-center gap-2">
                <span class="font-bold select-all">${m.cedula}</span>
                <button type="button" onclick="copiarTexto('${m.cedula}')" class="text-blue-500"><iconify-icon icon="solar:copy-bold"></iconify-icon></button>
            </div>
        </div>`;
    if(m.telefono) html += `
        <div class="flex justify-between items-center">
            <span>Tel/Cuenta:</span> 
            <div class="flex items-center gap-2">
                <span class="font-bold select-all">${m.telefono}</span>
                <button type="button" onclick="copiarTexto('${m.telefono}')" class="text-blue-500"><iconify-icon icon="solar:copy-bold"></iconify-icon></button>
            </div>
        </div>`;

    html += `</div>`;
    container.innerHTML = html;
}

// ==========================================
// 8. FINALIZAR
// ==========================================

async function procesarCompraFinal() {
    // Igual que antes pero usando el monto calculado
    const ref = document.getElementById('input-referencia').value;
    const fileInput = document.getElementById('input-comprobante');
    if (!ref || ref.length < 4 || !fileInput.files.length) { Swal.fire('Error', 'Faltan datos de pago.', 'warning'); return; }

    Swal.fire({ title: 'Enviando...', didOpen: () => Swal.showLoading() });

    try {
        const file = fileInput.files[0];
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${file.name.split('.').pop()}`;
        const { error: upErr } = await supabaseClient.storage.from('comprobantes').upload(fileName, file);
        if (upErr) throw upErr;
        const { data: { publicUrl } } = supabaseClient.storage.from('comprobantes').getPublicUrl(fileName);

        const montoStr = document.getElementById('step4-total').innerText.replace(/[^\d.,]/g,'').replace(',','.'); 
        // Nota: Mejor usar variable global para evitar errores de parseo de string
        const precioUnitario = getLimit('price');
        const cantidad = parseInt(document.getElementById('custom-qty').value);
        const montoFinal = precioUnitario * cantidad;

        const { data: orden, error } = await supabaseClient.from('ordenes').insert([{
            id_sorteo: activeRaffle.id,
            nombre: document.getElementById('input-name').value,
            cedula: document.getElementById('input-cedula').value,
            telefono: document.getElementById('input-country-code').value + document.getElementById('input-phone').value,
            email: document.getElementById('input-email').value,
            metodo_pago: selectedMethodData.tipo, // Guardamos el tipo
            referencia_pago: ref,
            url_comprobante: publicUrl,
            monto_total: montoFinal,
            cantidad_boletos: cantidad,
            estado: 'pendiente_validacion'
        }]).select().single();

        if (error) throw error;

        const ids = ticketsReservados.map(t => t.id);
        const numeros = ticketsReservados.map(t => t.numero);
        await supabaseClient.from('tickets').update({ estado: 'pendiente', id_orden: orden.id }).in('id', ids);

        ticketsReservados = [];
        clearInterval(intervaloTimer);
        Swal.close();

        document.getElementById('assigned-tickets').innerHTML = numeros.map(n => `<span class="bg-red-100 text-red-700 font-bold px-3 py-1 rounded-lg text-sm border border-red-200">${n}</span>`).join('');
        document.getElementById('modal-footer').classList.add('hidden');
        document.getElementById('step-5').classList.add('hidden');
        document.getElementById('step-success').classList.remove('hidden');
        confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });

    } catch (e) { console.error(e); Swal.fire('Error', 'Intenta de nuevo.', 'error'); }
}

// Utilitarios
window.copiarTexto = function(t) { navigator.clipboard.writeText(t); Swal.mixin({toast:true,position:'top-end',showConfirmButton:false,timer:1500}).fire({icon:'success',title:'Copiado'}); }
async function liberarTickets() { if(ticketsReservados.length){ const ids=ticketsReservados.map(t=>t.id); await supabaseClient.from('tickets').update({estado:'disponible',id_orden:null}).in('id',ids); ticketsReservados=[]; } }
window.previewImage = function(i) { if(i.files[0]){ document.getElementById('upload-placeholder').classList.add('hidden'); document.getElementById('file-preview').classList.remove('hidden'); } }
window.mostrarAlertaStock = function(p,d) { document.getElementById('stock-pedido-val').innerText=p; document.getElementById('stock-disponible-val').innerText=d; document.getElementById('modal-stock-sutil').classList.remove('hidden'); }
window.cerrarAlertaStock = function(){ document.getElementById('modal-stock-sutil').classList.add('hidden'); }
async function limpiarBloqueosHuerfanos() { /* (Misma lógica anterior) */ }
function disablePurchaseButtons() { /* (Misma lógica anterior) */ }
