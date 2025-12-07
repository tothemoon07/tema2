// ==========================================
// CONFIGURACIÓN INICIAL Y SUPABASE
// ==========================================

const SUPABASE_URL = 'https://tpzuvrvjtxuvmyusjmpq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRwenV2cnZqdHh1dm15dXNqbXBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1NDMwMDAsImV4cCI6MjA4MDExOTAwMH0.YcGZLy7W92H0o0TN4E_v-2PUDtcSXhB-D7x7ob6TTp4';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Variables Globales
let ticketsReservados = [];
let intervaloTimer;
let currentStep = 1;
let activeCurrency = 'Bs'; // Por defecto Bs

// ==========================================
// 1. CARGA DE DATOS (INIT)
// ==========================================

document.addEventListener("DOMContentLoaded", async () => {
    // 1. Cargar datos del sorteo activo
    const { data: sorteo, error } = await supabaseClient
        .from('sorteos')
        .select('*')
        .eq('estado', 'activo')
        .single();

    if (sorteo) {
        // Llenar inputs ocultos generales
        if(document.getElementById('raffle-id')) document.getElementById('raffle-id').value = sorteo.id;
        
        // Llenar inputs ocultos de Bolívares
        if(document.getElementById('price-bs')) document.getElementById('price-bs').value = sorteo.precio_boleto;
        if(document.getElementById('min-bs')) document.getElementById('min-bs').value = sorteo.min_compra_bs || 1;
        if(document.getElementById('max-bs')) document.getElementById('max-bs').value = sorteo.max_compra_bs || 500;

        // Llenar inputs ocultos de Dólares
        if(document.getElementById('price-usd')) document.getElementById('price-usd').value = sorteo.precio_usd || 0;
        if(document.getElementById('min-usd')) document.getElementById('min-usd').value = sorteo.min_compra_usd || 1;
        if(document.getElementById('max-usd')) document.getElementById('max-usd').value = sorteo.max_compra_usd || 100;

        // Actualizar UI del Landing
        setText('landing-title', sorteo.titulo);
        setText('landing-date', new Date(sorteo.fecha_sorteo).toLocaleDateString());
        setText('landing-price-display', `Bs. ${sorteo.precio_boleto} / $${sorteo.precio_usd || 0}`);
        setText('landing-lottery', sorteo.loteria);

        if(sorteo.url_flyer) {
            const imgEl = document.getElementById('landing-image');
            if(imgEl) imgEl.src = sorteo.url_flyer;
        }

    } else {
        setText('landing-title', "No hay sorteo activo");
        disablePurchaseButtons();
    }

    // 2. Cargar Métodos de Pago
    loadPaymentMethodsForWizard();
    
    // 3. Limpieza preventiva
    limpiarBloqueosHuerfanos();
});

function setText(id, text) { const el = document.getElementById(id); if(el) el.innerText = text; }

// 🔥 FUNCIÓN DE LIMPIEZA AUTOMÁTICA
async function limpiarBloqueosHuerfanos() {
    const hace20min = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    try {
        const { data: zombies } = await supabaseClient.from('tickets').select('id').eq('estado', 'bloqueado').lt('created_at', hace20min);
        if(zombies && zombies.length > 0) {
            const ids = zombies.map(t => t.id);
            await supabaseClient.from('tickets').update({ estado: 'disponible', id_orden: null }).in('id', ids);
        }
    } catch (e) { console.warn("Auto-limpieza:", e); }
}

window.addEventListener('beforeunload', function (e) {
    if (ticketsReservados.length > 0) {
        const ids = ticketsReservados.map(t => t.id);
        supabaseClient.from('tickets').update({ estado: 'disponible' }).in('id', ids).then(() => {});
        e.preventDefault(); e.returnValue = '';
    }
});

// ==========================================
// 2. WIZARD: MÉTODOS DE PAGO (PASO 1)
// ==========================================

async function loadPaymentMethodsForWizard() {
    const container = document.getElementById('payment-methods-list');
    if(!container) return;
    
    container.innerHTML = '<p class="text-center text-xs text-gray-400 animate-pulse">Cargando métodos de pago...</p>';
    
    const { data: methods } = await supabaseClient.from('metodos_pago').select('*').eq('activo', true);
    
    if(!methods || methods.length === 0) {
        container.innerHTML = '<p class="text-center text-xs text-red-400">No hay métodos de pago disponibles.</p>';
        return;
    }

    const icons = {
        'pago_movil': { icon: 'solar:smartphone-2-bold-duotone', color: 'text-blue-500', bg: 'bg-blue-50', label: 'Pago Móvil' },
        'transferencia': { icon: 'solar:bank-bold-duotone', color: 'text-green-500', bg: 'bg-green-50', label: 'Transferencia' },
        'binance': { icon: 'simple-icons:binance', color: 'text-yellow-500', bg: 'bg-yellow-50', label: 'Binance' },
        'zelle': { icon: 'simple-icons:zelle', color: 'text-purple-600', bg: 'bg-purple-50', label: 'Zelle' },
        'zinli': { icon: 'simple-icons:zinli', color: 'text-indigo-500', bg: 'bg-indigo-50', label: 'Zinli' },
        'default': { icon: 'solar:card-bold', color: 'text-gray-500', bg: 'bg-gray-100', label: 'Otro' }
    };

    let html = '';
    methods.forEach((m) => {
        const style = icons[m.tipo] || icons['default'];
        
        // =========================================================================
        // 🔴 AQUÍ SE GESTIONA EL LOGO DE PAGO MÓVIL
        // =========================================================================
        let logoHtml = '';
        
        if (m.tipo === 'pago_movil') {
            // URL Pública de un logo de Pago Móvil. Si quieres usar TU imagen:
            // 1. Súbela a tu Supabase Storage (Bucket 'images').
            // 2. Copia la "Get Public URL".
            // 3. Pégala abajo reemplazando la que está.
            const urlPagoMovil = "https://seeklogo.com/images/P/pago-movil-id-logo-9B00CA77B2-seeklogo.com.png"; 
            
            logoHtml = `<img src="${urlPagoMovil}" alt="Pago Movil" style="width: 40px; height: 40px; object-fit: contain;">`;
        } else {
            // Para el resto (Binance, Zelle, Zinli) usamos los íconos vectoriales
             logoHtml = `<iconify-icon icon="${style.icon}"></iconify-icon>`;
        }
        // =========================================================================

        html += `
            <label class="block relative cursor-pointer group">
                <input type="radio" name="payment_method" value="${m.tipo}" data-id="${m.id}" class="peer hidden" onchange="selectPaymentMethod('${m.tipo}')">
                
                <div class="border-2 border-gray-100 peer-checked:border-red-500 peer-checked:bg-red-50 peer-checked:shadow-md rounded-2xl p-4 flex items-center gap-4 transition-all bg-white hover:border-red-200">
                    <div class="w-12 h-12 ${style.bg} ${style.color} rounded-xl flex items-center justify-center text-2xl flex-shrink-0">
                        ${logoHtml}
                    </div>
                    <div class="flex-1">
                        <h4 class="font-bold text-gray-800 text-sm">${m.banco || style.label}</h4>
                        <p class="text-[10px] text-gray-500 uppercase font-bold opacity-70">${style.label}</p>
                    </div>
                    <div class="w-5 h-5 rounded-full border-2 border-gray-300 peer-checked:border-red-500 peer-checked:bg-red-500 flex items-center justify-center text-white text-xs">
                        <iconify-icon icon="mingcute:check-line"></iconify-icon>
                    </div>
                </div>
            </label>
        `;
    });
    
    container.innerHTML = html;
}

window.selectPaymentMethod = function(tipo) {
    // Definir moneda según el tipo seleccionado
    if (tipo === 'pago_movil' || tipo === 'transferencia') {
        activeCurrency = 'Bs';
    } else {
        activeCurrency = 'USD';
    }
    // Resetear cantidad a 1 al cambiar de método para evitar inconsistencias
    document.getElementById('custom-qty').value = 1;
    document.querySelectorAll('.qty-btn').forEach(b => b.classList.remove('qty-btn-selected'));
}

function disablePurchaseButtons() {
    document.querySelectorAll('button[onclick="abrirModalCompra()"]').forEach(b => { 
        b.disabled = true; b.innerHTML = 'NO DISPONIBLE'; b.classList.replace('bg-red-500','bg-gray-400');
    });
}

// ==========================================
// 3. LÓGICA DE COMPRA (CANTIDAD Y PRECIO) - PASO 2
// ==========================================

window.selectQty = function(n, btn) {
    const min = getMin();
    const max = getMax();

    if(n < min) { Swal.fire('Atención', `La compra mínima con este método es de ${min} boletos.`, 'info'); n = min; }
    if(n > max) { Swal.fire('Atención', `La compra máxima con este método es de ${max} boletos.`, 'info'); n = max; }

    document.querySelectorAll('.qty-btn').forEach(b => b.classList.remove('qty-btn-selected'));
    btn.classList.add('qty-btn-selected');
    document.getElementById('custom-qty').value = n; 
    window.updateTotal(); 
}

window.changeQty = function(n) { 
    let val = parseInt(document.getElementById('custom-qty').value) || 0; 
    let min = getMin();
    let max = getMax();

    val += n; 
    
    if(val < min) { val = min; }
    if(val > max) { val = max; Swal.fire('Máximo alcanzado', `No puedes comprar más de ${max} boletos.`, 'warning'); }
    
    document.getElementById('custom-qty').value = val; 
    window.updateTotal();
    document.querySelectorAll('.qty-btn').forEach(b => b.classList.remove('qty-btn-selected'));
}

// Funciones auxiliares para obtener límites según moneda activa
function getPrice() { return activeCurrency === 'Bs' ? parseFloat(document.getElementById('price-bs').value) : parseFloat(document.getElementById('price-usd').value); }
function getMin() { return activeCurrency === 'Bs' ? parseInt(document.getElementById('min-bs').value) : parseInt(document.getElementById('min-usd').value); }
function getMax() { return activeCurrency === 'Bs' ? parseInt(document.getElementById('max-bs').value) : parseInt(document.getElementById('max-usd').value); }

window.updateTotal = function() {
    let val = parseInt(document.getElementById('custom-qty').value) || 1;
    let price = getPrice();
    let total = val * price;
    
    let symbol = activeCurrency === 'Bs' ? 'Bs. ' : '$ ';
    let text = symbol + total.toLocaleString('es-VE', {minimumFractionDigits: 2});
    
    // Actualizar Textos
    ['step2-total', 'step4-total', 'success-total'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.innerText = text;
    });

    // Actualizar Hint de Límites
    const hint = document.getElementById('currency-limits-hint');
    if(hint) hint.innerText = `Límites para ${activeCurrency}: Mín ${getMin()} - Máx ${getMax()}`;
}

// ==========================================
// 4. MODALES Y PASOS (WIZARD)
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
        const el = document.getElementById(`step-${i}`);
        if(el) el.classList.add('hidden');
    }
    const stepEl = document.getElementById(`step-${paso}`);
    if(stepEl) stepEl.classList.remove('hidden');
    
    // Si entramos al Paso 2, actualizamos totales inmediatamente
    if(paso === 2) window.updateTotal();
    
    // Si entramos al Paso 4, renderizamos los datos del pago
    if(paso === 4) renderPaymentDetails();

    window.updateModalHeader();
}

window.updateModalHeader = function() {
    const titles = ["Método de Pago", "Cantidad de Boletos", "Datos Personales", "Realizar Pago", "Confirmar"];
    const icons = ["solar:card-bold-duotone", "solar:ticket-bold-duotone", "solar:user-bold-duotone", "solar:bill-check-bold-duotone", "solar:upload-track-bold-duotone"];
    
    let visualStep = currentStep;
    if(currentStep === 5) visualStep = 5; 
    
    const titleEl = document.getElementById('header-title');
    if(titleEl) titleEl.innerText = titles[currentStep - 1] || "Finalizar";
    
    const stepEl = document.getElementById('header-step');
    if(stepEl) stepEl.innerText = `Paso ${visualStep} de 5`;
    
    const iconEl = document.getElementById('header-icon');
    if(iconEl) iconEl.setAttribute('icon', icons[currentStep - 1] || "solar:check-circle-bold");
    
    const prog = document.getElementById('progress-bar');
    if(prog) prog.style.width = `${visualStep * 20}%`;

    const btnBack = document.getElementById('btn-back');
    if(btnBack) {
        btnBack.disabled = (currentStep === 1);
        btnBack.classList.toggle('opacity-50', currentStep === 1);
    }

    const btnNext = document.getElementById('btn-next');
    if(btnNext) {
        btnNext.innerHTML = (currentStep === 5) 
            ? `Finalizar <iconify-icon icon="solar:check-circle-bold"></iconify-icon>` 
            : `Continuar <iconify-icon icon="solar:arrow-right-bold"></iconify-icon>`;
    }
}

window.prevStep = function() {
    if (currentStep > 1) {
        currentStep--;
        window.mostrarPaso(currentStep);
    }
}

// ==========================================
// 5. VALIDACIÓN DE STOCK
// ==========================================

async function validarStockReal() {
    const raffleIdInput = document.getElementById('raffle-id');
    const raffleId = raffleIdInput ? raffleIdInput.value : null;
    const cantidad = parseInt(document.getElementById('custom-qty').value);
    
    const min = getMin();
    const max = getMax();

    if (cantidad < min) { 
        Swal.fire('Error', `Debes comprar al menos ${min} boletos.`, 'error'); 
        return false; 
    }
    if (cantidad > max) { 
        Swal.fire('Error', `La compra máxima es de ${max} boletos.`, 'error'); 
        return false; 
    }
    if (!raffleId || cantidad <= 0) return false;

    const { count, error } = await supabaseClient
        .from('tickets')
        .select('*', { count: 'exact', head: true })
        .eq('id_sorteo', raffleId)
        .eq('estado', 'disponible');

    if (error) { console.error(error); return false; }

    if (count < cantidad) {
        window.mostrarAlertaStock(cantidad, count);
        return false;
    }
    return await reservarTicketsEnDB(cantidad, raffleId);
}

async function reservarTicketsEnDB(cantidad, raffleId) {
    const { data: tickets, error } = await supabaseClient
        .from('tickets')
        .select('id, numero')
        .eq('id_sorteo', raffleId)
        .eq('estado', 'disponible')
        .limit(cantidad);

    if (error || !tickets || tickets.length < cantidad) {
        Swal.fire('Lo sentimos', 'Alguien compró los boletos antes que tú.', 'warning');
        return false;
    }

    const ids = tickets.map(t => t.id);
    await supabaseClient.from('tickets').update({ estado: 'bloqueado' }).in('id', ids);
    ticketsReservados = tickets;
    return true;
}

window.mostrarAlertaStock = function(pedidos, disponibles) {
    document.getElementById('stock-pedido-val').innerText = pedidos;
    document.getElementById('stock-disponible-val').innerText = disponibles;
    document.getElementById('modal-stock-sutil').classList.remove('hidden');
}
window.cerrarAlertaStock = function() { document.getElementById('modal-stock-sutil').classList.add('hidden'); }

// ==========================================
// 6. CONTROL DE PASOS
// ==========================================

window.nextStep = async function() {
    // Paso 1: Selección Método
    if(currentStep === 1) {
        const method = document.querySelector('input[name="payment_method"]:checked');
        if(!method) { Swal.fire({ icon: 'warning', text: 'Por favor elige un método de pago.' }); return; }
    }

    // Paso 2: Cantidad (Validar Stock - EL CRÍTICO)
    else if(currentStep === 2) {
        const btn = document.getElementById('btn-next');
        const originalText = btn.innerHTML;
        btn.innerHTML = 'Verificando...';
        btn.disabled = true;

        const check = await validarStockReal();
        btn.innerHTML = originalText;
        btn.disabled = false;

        if (!check) return; 
        iniciarTimer();
    }

    // Paso 3: Datos
    else if(currentStep === 3) {
        const name = document.getElementById('input-name').value;
        const cedula = document.getElementById('input-cedula').value;
        const phone = document.getElementById('input-phone').value;
        if(!name || !cedula || !phone) { Swal.fire({ icon: 'warning', text: 'Completa nombre, cédula y teléfono.' }); return; }
    }
    
    // Paso 4: Solo visualiza info, no valida nada extra.

    // Paso 5: Finalizar
    else if (currentStep === 5) {
        procesarCompraFinal();
        return;
    }

    // Avanzar
    if (currentStep < 5) {
        currentStep++;
        window.mostrarPaso(currentStep);
    }
};

function iniciarTimer() {
    clearInterval(intervaloTimer);
    let timeLeft = 1200; // 20 Minutos
    document.getElementById('timer-container').classList.remove('hidden');
    intervaloTimer = setInterval(() => {
        let min = Math.floor(timeLeft / 60);
        let sec = timeLeft % 60;
        const el = document.getElementById('countdown');
        if(el) el.innerText = `${min}:${sec < 10 ? '0'+sec : sec}`;
        
        if (timeLeft <= 0) {
            clearInterval(intervaloTimer);
            liberarTickets();
            Swal.fire({ title: 'Tiempo Agotado', text: 'Se liberaron tus boletos.', icon: 'error', confirmButtonText: 'Entendido' }).then(() => location.reload());
        }
        timeLeft--;
    }, 1000);
}

async function liberarTickets() {
    if (ticketsReservados.length === 0) return;
    const ids = ticketsReservados.map(t => t.id);
    await supabaseClient.from('tickets').update({ estado: 'disponible', id_orden: null }).in('id', ids);
    ticketsReservados = [];
}

// ==========================================
// 7. RENDERIZADO DE INFO DE PAGO (PASO 4)
// ==========================================

async function renderPaymentDetails() {
    const container = document.getElementById('payment-details-view');
    const selectedRadio = document.querySelector('input[name="payment_method"]:checked');
    if(!selectedRadio) return;
    
    const id = selectedRadio.dataset.id;
    const { data: m } = await supabaseClient.from('metodos_pago').select('*').eq('id', id).single();
    
    if(!m) { container.innerHTML = 'Error cargando datos.'; return; }

    let html = `
        <div class="bg-gray-50 border border-gray-200 rounded-xl p-6 text-center shadow-sm">
            <h4 class="font-bold text-gray-800 text-lg mb-4 uppercase">${m.banco}</h4>
            <div class="space-y-3 text-sm text-gray-600">
    `;

    if(m.titular) html += `<div class="flex justify-between border-b border-gray-100 pb-2"><span>Titular:</span> <span class="font-bold select-all">${m.titular}</span></div>`;
    if(m.cedula) html += `<div class="flex justify-between border-b border-gray-100 pb-2"><span>ID / Cédula:</span> <span class="font-bold select-all">${m.cedula}</span></div>`;
    if(m.telefono) html += `<div class="flex justify-between border-b border-gray-100 pb-2"><span>Teléfono / Cuenta:</span> <span class="font-bold select-all text-lg text-gray-800">${m.telefono}</span></div>`;
    
    html += `
            </div>
            <div class="mt-4 pt-2">
                <button onclick="copiarTexto('${m.telefono}')" class="text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold py-2 px-4 rounded-lg transition">Copiar Número</button>
            </div>
        </div>
        <div class="bg-yellow-50 p-3 rounded-lg border border-yellow-100 flex gap-3 items-start">
             <iconify-icon icon="solar:info-circle-bold" class="text-yellow-500 mt-0.5 text-lg"></iconify-icon>
             <p class="text-xs text-yellow-700">Realiza el pago exacto y guarda una captura de pantalla. La necesitarás en el siguiente paso.</p>
        </div>
    `;
    
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

// ==========================================
// 8. PROCESAR COMPRA FINAL
// ==========================================

async function procesarCompraFinal() {
    const ref = document.getElementById('input-referencia').value;
    const file = document.getElementById('input-comprobante');
    
    if (!ref || ref.length < 4) { Swal.fire('Error', 'Ingresa una referencia válida.', 'warning'); return; }
    if (!file.files.length) { Swal.fire('Error', 'Sube la foto del pago.', 'warning'); return; }

    Swal.fire({ title: 'Enviando...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        const imgFile = file.files[0];
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${imgFile.name.split('.').pop()}`;
        const { error: upErr } = await supabaseClient.storage.from('comprobantes').upload(fileName, imgFile);
        if (upErr) throw upErr;
        const { data: { publicUrl } } = supabaseClient.storage.from('comprobantes').getPublicUrl(fileName);

        const nombre = document.getElementById('input-name').value;
        const cedula = document.getElementById('input-cedula').value;
        const country = document.getElementById('input-country-code').value;
        const phone = document.getElementById('input-phone').value;
        const email = document.getElementById('input-email').value;
        const raffleId = document.getElementById('raffle-id').value;
        const cantidad = parseInt(document.getElementById('custom-qty').value);
        const method = document.querySelector('input[name="payment_method"]:checked').value;
        
        // Obtener monto limpio (quitando símbolos)
        let montoStr = document.getElementById('step2-total').innerText.replace('Bs.', '').replace('$','').replace(/\./g,'').replace(',','.');
        let monto = parseFloat(montoStr);

        const { data: orden, error } = await supabaseClient.from('ordenes').insert([{
            id_sorteo: raffleId, nombre, cedula, telefono: country + phone, email,
            metodo_pago: method, referencia_pago: ref, url_comprobante: publicUrl,
            monto_total: monto, cantidad_boletos: cantidad, estado: 'pendiente_validacion'
        }]).select().single();

        if (error) throw error;

        const ids = ticketsReservados.map(t => t.id);
        const numeros = ticketsReservados.map(t => t.numero);
        await supabaseClient.from('tickets').update({ estado: 'pendiente', id_orden: orden.id }).in('id', ids);

        ticketsReservados = [];
        clearInterval(intervaloTimer);
        Swal.close();

        const container = document.getElementById('assigned-tickets');
        if(container) container.innerHTML = numeros.map(n => `<span class="bg-red-100 text-red-700 font-bold px-3 py-1 rounded-lg text-sm border border-red-200">${n}</span>`).join('');
        
        document.getElementById('modal-footer').classList.add('hidden');
        document.getElementById('step-5').classList.add('hidden');
        document.getElementById('step-success').classList.remove('hidden');
        confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });

    } catch (err) {
        console.error(err);
        Swal.fire('Error', 'Hubo un error enviando la orden. Intenta de nuevo.', 'error');
    }
}

// ==========================================
// 9. NAVEGACIÓN Y EXTRAS
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

    const { data: ordenes } = await supabaseClient.from('ordenes').select('*').eq('cedula', cedula).order('creado_en', {ascending:false});
    
    if(!ordenes || ordenes.length === 0) {
        div.innerHTML = '<p class="text-center text-gray-400 p-4">No se encontraron compras con esa cédula.</p>'; return;
    }

    let html = '';
    for (let orden of ordenes) {
        const { data: tickets } = await supabaseClient.from('tickets').select('numero').eq('id_orden', orden.id);
        const nums = tickets ? tickets.map(t => `<span class="bg-gray-100 px-1 rounded border">${t.numero}</span>`).join(' ') : 'Pendientes';
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
                    <p class="text-[10px] text-gray-400 mb-2">${new Date(orden.creado_en).toLocaleDateString()}</p>
                    <div class="flex flex-wrap gap-1 text-xs font-mono font-bold text-gray-700">${nums}</div>
                </div>
            </div>`;
    }
    div.innerHTML = html;
}
