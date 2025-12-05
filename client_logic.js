// client_logic.js - VERSIÓN BLINDADA + FLUJO OPTIMIZADO (Acordeón Pagos)

const SUPABASE_URL = 'https://tpzuvrvjtxuvmyusjmpq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRwenV2cnZqdHh1dm15dXNqbXBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1NDMwMDAsImV4cCI6MjA4MDExOTAwMH0.YcGZLy7W92H0o0TN4E_v-2PUDtcSXhB-D7x7ob6TTp4';

const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

// Variables Globales
let currentStep = 1; 
let ticketsReservados = []; 
let intervaloTimer = null;
let activeRaffle = null;

// ==========================================
// 1. CARGA INICIAL Y LIMPIEZA AUTOMÁTICA
// ==========================================

window.onload = async function() {
    console.log("Iniciando sistema...");

    // 🧹 EL CONSERJE: Limpiar tickets "zombies" (bloqueados hace mucho tiempo)
    limpiarBloqueosHuerfanos();

    // 1. Cargar Info del Sorteo Activo
    const { data: sorteo } = await supabaseClient
        .from('sorteos')
        .select('*')
        .eq('estado', 'activo')
        .single();

    if (sorteo) {
        activeRaffle = sorteo;
        
        // Inyectar datos en HTML
        const idInput = document.getElementById('raffle-id');
        const priceInput = document.getElementById('raffle-price');
        
        if(idInput) idInput.value = sorteo.id;
        if(priceInput) priceInput.value = sorteo.precio_boleto;
        
        setText('landing-title', sorteo.titulo);
        setText('landing-price-display', `Bs. ${sorteo.precio_boleto.toFixed(2)}`);
        setText('landing-date', sorteo.fecha_sorteo);
        setText('landing-lottery', sorteo.loteria);

        // Actualizar Flyer
        if(sorteo.url_flyer) {
            const imgEl = document.getElementById('landing-image');
            if(imgEl) imgEl.src = sorteo.url_flyer;
        }

        updateTotal(); // Actualizar cálculos iniciales
    } else {
        setText('landing-title', "No hay sorteo activo");
        disablePurchaseButtons();
    }

    // 2. Cargar Métodos de Pago en el PASO 1
    loadPaymentMethodsForModal();
};

function setText(id, text) { const el = document.getElementById(id); if(el) el.innerText = text; }

// 🔥 FUNCIÓN DE LIMPIEZA AUTOMÁTICA
async function limpiarBloqueosHuerfanos() {
    const hace20min = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    try {
        const { data: zombies } = await supabaseClient
            .from('tickets')
            .select('id')
            .eq('estado', 'bloqueado')
            .lt('created_at', hace20min);

        if(zombies && zombies.length > 0) {
            console.log(`🧹 Encontrados ${zombies.length} tickets zombies. Liberando...`);
            const ids = zombies.map(t => t.id);
            await supabaseClient.from('tickets').update({ estado: 'disponible', id_orden: null }).in('id', ids);
        }
    } catch (e) { console.warn("Auto-limpieza:", e); }
}

// 🛡️ PROTECCIÓN AL CERRAR PESTAÑA
window.addEventListener('beforeunload', function (e) {
    if (ticketsReservados.length > 0) {
        const ids = ticketsReservados.map(t => t.id);
        supabaseClient.from('tickets').update({ estado: 'disponible' }).in('id', ids).then(() => {});
        e.preventDefault(); 
        e.returnValue = '';
    }
});

// 🔥 NUEVA LÓGICA: CARGAR MÉTODOS EN PASO 1 (ACORDEÓN)
async function loadPaymentMethodsForModal() {
    const container = document.getElementById('payment-methods-list');
    if(!container) return;
    
    container.innerHTML = '<p class="text-center text-xs text-gray-400 animate-pulse">Cargando métodos de pago...</p>';
    
    const { data: methods } = await supabaseClient.from('metodos_pago').select('*').eq('activo', true);
    
    if(!methods || methods.length === 0) {
        container.innerHTML = '<p class="text-center text-xs text-red-400">No hay métodos de pago disponibles.</p>';
        return;
    }

    // Mapa de Iconos Bonitos
    const icons = {
        'pago_movil': { icon: 'solar:smartphone-2-bold-duotone', color: 'text-blue-500', bg: 'bg-blue-50', label: 'Pago Móvil' },
        'transferencia': { icon: 'solar:bank-bold-duotone', color: 'text-green-500', bg: 'bg-green-50', label: 'Transferencia' },
        'binance': { icon: 'simple-icons:binance', color: 'text-yellow-500', bg: 'bg-yellow-50', label: 'Binance' },
        'zelle': { icon: 'simple-icons:zelle', color: 'text-purple-600', bg: 'bg-purple-50', label: 'Zelle' },
        'zinli': { icon: 'simple-icons:zinli', color: 'text-indigo-500', bg: 'bg-indigo-50', label: 'Zinli' },
        'paypal': { icon: 'logos:paypal', color: 'text-blue-600', bg: 'bg-blue-50', label: 'PayPal' },
        'default': { icon: 'solar:card-bold', color: 'text-gray-500', bg: 'bg-gray-100', label: 'Otro' }
    };

    let html = '';
    methods.forEach((m, index) => {
        const style = icons[m.tipo] || icons['default'];
        const isFirst = index === 0 ? 'checked' : ''; // Pre-seleccionar el primero opcionalmente
        
        let detailsHtml = '';
        if(m.titular) detailsHtml += `<div class="mb-2"><p class="text-[10px] text-gray-400 uppercase font-bold">Titular</p><p class="text-sm font-medium text-gray-800">${m.titular}</p></div>`;
        
        if(m.cedula) detailsHtml += `
            <div class="mb-2">
                <p class="text-[10px] text-gray-400 uppercase font-bold">Documento / ID</p>
                <div class="flex items-center gap-2">
                    <p class="text-sm font-medium text-gray-800">${m.cedula}</p>
                    <button type="button" onclick="copiarTexto('${m.cedula}')" class="text-blue-500 hover:text-blue-700"><iconify-icon icon="solar:copy-bold"></iconify-icon></button>
                </div>
            </div>`;
            
        if(m.telefono) detailsHtml += `
            <div class="mb-2">
                <p class="text-[10px] text-gray-400 uppercase font-bold">Cuenta / Teléfono</p>
                <div class="flex items-center gap-2">
                    <p class="text-sm font-medium text-gray-800">${m.telefono}</p>
                    <button type="button" onclick="copiarTexto('${m.telefono}')" class="text-blue-500 hover:text-blue-700"><iconify-icon icon="solar:copy-bold"></iconify-icon></button>
                </div>
            </div>`;

        html += `
            <label class="block relative cursor-pointer group">
                <input type="radio" name="payment_method" value="${m.tipo}" class="peer hidden" ${isFirst} onchange="togglePaymentDetails(this)">
                
                <div class="border-2 border-gray-100 peer-checked:border-red-500 peer-checked:bg-red-50 peer-checked:shadow-md rounded-2xl p-4 flex items-center gap-4 transition-all bg-white relative z-10 hover:border-red-200">
                    <div class="w-10 h-10 ${style.bg} ${style.color} rounded-xl flex items-center justify-center text-xl flex-shrink-0">
                        <iconify-icon icon="${style.icon}"></iconify-icon>
                    </div>
                    <div class="flex-1">
                        <h4 class="font-bold text-gray-800 text-sm">${m.banco || style.label}</h4>
                        <p class="text-[10px] text-gray-500 uppercase font-bold opacity-70">${style.label}</p>
                    </div>
                    <div class="w-5 h-5 rounded-full border-2 border-gray-300 peer-checked:border-red-500 peer-checked:bg-red-500 flex items-center justify-center text-white text-xs">
                        <iconify-icon icon="mingcute:check-line"></iconify-icon>
                    </div>
                </div>

                <div class="payment-details-enter bg-white border-x-2 border-b-2 border-red-100 rounded-b-2xl mx-2 relative z-0 shadow-sm" style="${isFirst ? 'max-height: 300px; opacity: 1; margin-top: -10px; padding-top: 20px;' : ''}">
                    <div class="p-4 pt-2">
                        ${detailsHtml}
                        <div class="mt-3 p-2 bg-blue-50 rounded-lg flex items-start gap-2">
                            <iconify-icon icon="solar:info-circle-bold" class="text-blue-500 mt-0.5"></iconify-icon>
                            <p class="text-[10px] text-blue-700 leading-tight">Copia estos datos para realizar tu pago. Los necesitarás en el último paso.</p>
                        </div>
                    </div>
                </div>
            </label>
        `;
    });
    
    container.innerHTML = html;
}

// Función auxiliar para animar el acordeón manualmente si cambia
window.togglePaymentDetails = function(radio) {
    // Cerrar todos los detalles
    document.querySelectorAll('.payment-details-enter').forEach(el => {
        el.style.maxHeight = '0';
        el.style.opacity = '0';
        el.style.marginTop = '0';
        el.style.paddingTop = '0';
    });

    // Abrir el seleccionado
    const details = radio.parentNode.querySelector('.payment-details-enter');
    if(details) {
        details.style.maxHeight = '300px';
        details.style.opacity = '1';
        details.style.marginTop = '-10px';
        details.style.paddingTop = '20px';
    }
}

function disablePurchaseButtons() {
    document.querySelectorAll('button[onclick="abrirModalCompra()"]').forEach(b => { 
        b.disabled = true; 
        b.innerHTML = 'NO DISPONIBLE'; 
        b.classList.replace('bg-red-500','bg-gray-400');
    });
}

// ==========================================
// 2. NAVEGACIÓN Y UI
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

    if (action === 'home') {
        document.getElementById('view-home').classList.remove('hidden');
    } else if (action === 'terms') {
        document.getElementById('view-terms').classList.remove('hidden');
    } else if (action === 'verify') {
        document.getElementById('view-home').classList.remove('hidden');
        window.abrirModalVerificar();
    }
}
window.navigateTo = function(view) { window.menuAction(view); }

// ==========================================
// 3. LÓGICA DE COMPRA (CANTIDAD Y PRECIO)
// ==========================================

window.selectQty = function(n, btn) {
    document.querySelectorAll('.qty-btn').forEach(b => b.classList.remove('qty-btn-selected'));
    btn.classList.add('qty-btn-selected');
    document.getElementById('custom-qty').value = n; 
    window.updateTotal(); 
}

window.changeQty = function(n) { 
    let val = parseInt(document.getElementById('custom-qty').value) || 0; 
    val += n; 
    if(val < 1) val = 1; 
    document.getElementById('custom-qty').value = val; 
    window.updateTotal();
    document.querySelectorAll('.qty-btn').forEach(b => b.classList.remove('qty-btn-selected'));
}

window.updateTotal = function() {
    let val = parseInt(document.getElementById('custom-qty').value) || 1;
    let priceInput = document.getElementById('raffle-price');
    let price = priceInput ? parseFloat(priceInput.value) : 0; 
    
    let total = val * price;
    let text = "Bs. " + total.toLocaleString('es-VE', {minimumFractionDigits: 2});
    
    ['step2-total', 'step5-total-display', 'success-total'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.innerText = text;
    });
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
    const successStep = document.getElementById('step-success');
    if (successStep && !successStep.classList.contains('hidden')) {
        location.reload();
        return;
    }
    
    if(ticketsReservados.length > 0) {
        await liberarTickets();
    }
    
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
    window.updateModalHeader();
}

// ⚠️ ACTUALIZADO: Manejo de pasos (Saltando el 4)
window.updateModalHeader = function() {
    const titles = ["Método de Pago", "Cantidad de Boletos", "Datos Personales", "X", "Confirmar Pago"];
    const icons = ["solar:card-2-bold-duotone", "solar:ticket-bold-duotone", "solar:user-bold-duotone", "solar:wallet-money-bold-duotone", "solar:upload-track-bold-duotone"];
    
    // Ajuste visual para simular 4 pasos
    let visualStep = currentStep;
    if(currentStep === 5) visualStep = 4; 
    
    const titleEl = document.getElementById('header-title');
    if(titleEl) titleEl.innerText = titles[currentStep - 1];
    
    const stepEl = document.getElementById('header-step');
    if(stepEl) stepEl.innerText = `Paso ${visualStep} de 4`;
    
    const iconEl = document.getElementById('header-icon');
    if(iconEl) iconEl.setAttribute('icon', icons[currentStep - 1]);
    
    const prog = document.getElementById('progress-bar');
    if(prog) prog.style.width = `${visualStep * 25}%`;

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
        if(currentStep === 5) {
            // Si estamos en 5, volver a 3 (saltar el 4 que eliminamos)
            currentStep = 3;
        } else {
            currentStep--;
        }
        window.mostrarPaso(currentStep);
    }
}


// ==========================================
// 5. VALIDACIÓN DE STOCK REAL
// ==========================================

async function validarStockReal() {
    const raffleIdInput = document.getElementById('raffle-id');
    const raffleId = raffleIdInput ? raffleIdInput.value : null;
    const cantidad = parseInt(document.getElementById('custom-qty').value);
    
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
    // Paso 1: Método de pago
    if(currentStep === 1) {
        const method = document.querySelector('input[name="payment_method"]:checked');
        if(!method) { Swal.fire({ icon: 'warning', text: 'Selecciona un método para ver los datos.' }); return; }
    }

    // Paso 2: Cantidad (Validar Stock)
    if(currentStep === 2) {
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
    if(currentStep === 3) {
        const name = document.getElementById('input-name').value;
        const cedula = document.getElementById('input-cedula').value;
        const phone = document.getElementById('input-phone').value;
        if(!name || !cedula || !phone) { Swal.fire({ icon: 'warning', text: 'Completa nombre, cédula y teléfono.' }); return; }
        
        // 🚀 SALTO MÁGICO: Del paso 3 al 5 (Saltamos instrucciones redundantes)
        currentStep = 5;
        window.mostrarPaso(5);
        return;
    }

    // Avanzar normal (1 -> 2 -> 3)
    if (currentStep < 5) {
        currentStep++;
        window.mostrarPaso(currentStep);
    } else {
        procesarCompraFinal();
    }
};

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
            Swal.fire({
                title: 'Tiempo Agotado', 
                text: 'Se liberaron tus boletos.', 
                icon: 'error',
                confirmButtonText: 'Entendido'
            }).then(() => location.reload());
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
// 7. PROCESAR COMPRA FINAL
// ==========================================

async function procesarCompraFinal() {
    const ref = document.getElementById('input-referencia').value;
    const file = document.getElementById('input-comprobante');
    
    if (!ref || ref.length < 4) { Swal.fire('Error', 'Ingresa una referencia válida.', 'warning'); return; }
    if (!file.files.length) { Swal.fire('Error', 'Sube la foto del pago.', 'warning'); return; }

    Swal.fire({ title: 'Enviando...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        // 1. Subir Imagen
        const imgFile = file.files[0];
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${imgFile.name.split('.').pop()}`;
        const { error: upErr } = await supabaseClient.storage.from('comprobantes').upload(fileName, imgFile);
        if (upErr) throw upErr;
        const { data: { publicUrl } } = supabaseClient.storage.from('comprobantes').getPublicUrl(fileName);

        // 2. Datos
        const nombre = document.getElementById('input-name').value;
        const cedula = document.getElementById('input-cedula').value;
        const country = document.getElementById('input-country-code').value;
        const phone = document.getElementById('input-phone').value;
        const email = document.getElementById('input-email').value;
        const raffleId = document.getElementById('raffle-id').value;
        const cantidad = parseInt(document.getElementById('custom-qty').value);
        const method = document.querySelector('input[name="payment_method"]:checked').value;
        
        // Obtener Total del elemento display (ya calculado)
        let montoStr = document.getElementById('step5-total-display').innerText.replace('Bs.', '').replace(/\./g,'').replace(',','.');
        let monto = parseFloat(montoStr);

        // 3. Crear Orden
        const { data: orden, error } = await supabaseClient.from('ordenes').insert([{
            id_sorteo: raffleId,
            nombre, cedula, telefono: country + phone, email,
            metodo_pago: method,
            referencia_pago: ref,
            url_comprobante: publicUrl,
            monto_total: monto,
            cantidad_boletos: cantidad,
            estado: 'pendiente_validacion'
        }]).select().single();

        if (error) throw error;

        // 4. Asignar Tickets a la Orden
        const ids = ticketsReservados.map(t => t.id);
        const numeros = ticketsReservados.map(t => t.numero);
        
        await supabaseClient.from('tickets').update({ estado: 'pendiente', id_orden: orden.id }).in('id', ids);

        // 5. Finalizar
        ticketsReservados = [];
        clearInterval(intervaloTimer);
        Swal.close();

        // UI Éxito
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
// 8. CONSULTA (VERIFICAR)
// ==========================================

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
        div.innerHTML = '<p class="text-center text-gray-400 p-4">No se encontraron compras con esa cédula.</p>';
        return;
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
            </div>
        `;
    }
    div.innerHTML = html;
}
