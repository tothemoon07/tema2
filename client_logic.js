// client_logic.js - VERSIÓN FINAL DINÁMICA CONECTADA A SUPABASE

// ⚠️ TUS CLAVES DE SUPABASE
const SUPABASE_URL = 'https://tpzuvrvjtxuvmyusjmpq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRwenV2cnZqdHh1dm15dXNqbXBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1NDMwMDAsImV4cCI6MjA4MDExOTAwMH0.YcGZLy7W92H0o0TN4E_v-2PUDtcSXhB-D7x7ob6TTp4';

const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

// Variables Globales
let currentStep = 1; 
let ticketsReservados = []; 
let intervaloTimer = null;
let activeRaffle = null; // Guardará la información del sorteo activo

// ==========================================
// 1. CARGA INICIAL DE DATOS (SORTEO Y PAGOS)
// ==========================================

window.onload = async function() {
    try {
        console.log("Iniciando carga de datos...");

        // 1. Cargar Info del Sorteo Activo
        const { data: sorteo, error } = await supabaseClient
            .from('sorteos')
            .select('*')
            .eq('estado', 'activo')
            .single();

        if (sorteo) {
            console.log("Sorteo activo encontrado:", sorteo.titulo);
            activeRaffle = sorteo;
            
            // Inyectar datos en el HTML (Inputs ocultos para la lógica)
            const raffleIdInput = document.getElementById('raffle-id');
            const rafflePriceInput = document.getElementById('raffle-price');
            
            if(raffleIdInput) raffleIdInput.value = sorteo.id;
            if(rafflePriceInput) rafflePriceInput.value = sorteo.precio_boleto;
            
            // Inyectar textos visibles (Título, fecha, lotería)
            const titleEl = document.getElementById('landing-title');
            if(titleEl) titleEl.innerText = sorteo.titulo;

            const priceEl = document.getElementById('landing-price-display');
            if(priceEl) priceEl.innerText = `Bs. ${sorteo.precio_boleto.toFixed(2)}`;

            const dateEl = document.getElementById('landing-date');
            if(dateEl) dateEl.innerText = sorteo.fecha_sorteo;

            const lotoEl = document.getElementById('landing-lottery');
            if(lotoEl) lotoEl.innerText = sorteo.loteria;

            // Inyectar Imagen del Flyer
            const imgEl = document.getElementById('landing-image');
            if(imgEl && sorteo.url_flyer) imgEl.src = sorteo.url_flyer;

            // Actualizar total inicial en modales
            updateTotal();
        } else {
            console.warn("No hay sorteo activo en la base de datos.");
            const titleEl = document.getElementById('landing-title');
            if(titleEl) titleEl.innerText = "No hay sorteo activo por el momento.";
            disablePurchaseButtons();
        }

        // 2. Cargar Métodos de Pago
        loadPaymentMethodsForModal();

    } catch(e) { 
        console.error("Error en la carga inicial:", e); 
    }
};

async function loadPaymentMethodsForModal() {
    const container = document.getElementById('payment-methods-container');
    if(!container) return;
    
    // Traer bancos activos
    const { data: methods } = await supabaseClient
        .from('metodos_pago')
        .select('*')
        .eq('activo', true);
    
    if(!methods || methods.length === 0) {
        container.innerHTML = '<p class="text-center text-xs text-red-400">No hay métodos de pago disponibles en este momento.</p>';
        return;
    }

    let html = '';
    methods.forEach(m => {
        // Formatear tipo de cuenta (corriente/ahorro/pago movil)
        let tipoBadge = m.tipo.replace('_', ' ').toUpperCase();
        
        html += `
            <div class="border-b border-gray-100 pb-2 last:border-0 mb-3">
                <div class="flex justify-between items-center mb-1">
                    <span class="text-gray-700 text-xs font-black uppercase flex items-center gap-1">
                        <iconify-icon icon="solar:card-bold" class="text-blue-500"></iconify-icon> ${m.banco}
                    </span>
                    <span class="text-[9px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded font-bold">${tipoBadge}</span>
                </div>
                <div class="text-xs text-gray-500 mb-1">${m.titular}</div>
                
                <div class="bg-gray-50 p-2 rounded-lg space-y-1">
                    <div class="flex justify-between items-center">
                        <span class="text-gray-400 text-[10px] uppercase font-bold">Cédula / RIF</span>
                        <div class="flex items-center gap-1">
                            <span class="font-bold text-gray-800 text-xs">${m.cedula}</span>
                            <button onclick="copiarTexto('${m.cedula}')" class="text-blue-400 hover:text-blue-600"><iconify-icon icon="solar:copy-bold" width="12"></iconify-icon></button>
                        </div>
                    </div>
                    <div class="flex justify-between items-center">
                        <span class="text-gray-400 text-[10px] uppercase font-bold">Teléfono / Cuenta</span>
                        <div class="flex items-center gap-1">
                            <span class="font-bold text-gray-800 text-xs">${m.telefono}</span>
                            <button onclick="copiarTexto('${m.telefono}')" class="text-blue-400 hover:text-blue-600"><iconify-icon icon="solar:copy-bold" width="12"></iconify-icon></button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
}

function disablePurchaseButtons() {
    const btns = document.querySelectorAll('button[onclick="abrirModalCompra()"]');
    btns.forEach(b => { 
        b.disabled = true; 
        b.innerHTML = '<i class="fas fa-lock"></i> NO DISPONIBLE'; 
        b.classList.add('bg-gray-400');
        b.classList.remove('bg-red-600', 'hover:bg-red-700');
    });
}

// ==========================================
// 2. FUNCIONES UI (NAVEGACIÓN)
// ==========================================

window.toggleMenu = function() {
    const menu = document.getElementById('side-menu');
    const overlay = document.getElementById('menu-overlay');
    if (menu.classList.contains('menu-open')) {
        menu.classList.remove('menu-open');
        overlay.classList.add('hidden');
        document.body.style.overflow = 'auto';
    } else {
        menu.classList.add('menu-open');
        overlay.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }
}

window.menuAction = function(action) {
    window.toggleMenu(); 
    document.getElementById('view-home').classList.add('hidden');
    // document.getElementById('view-raffles').classList.add('hidden'); // Si usas vista de sorteos
    document.getElementById('view-terms').classList.add('hidden');
    document.getElementById('floating-btn').classList.add('hidden');
    window.scrollTo(0,0);

    if (action === 'home') {
        document.getElementById('view-home').classList.remove('hidden');
        document.getElementById('floating-btn').classList.remove('hidden');
    } else if (action === 'terms') {
        document.getElementById('view-terms').classList.remove('hidden');
    } else if (action === 'verify') {
        document.getElementById('view-home').classList.remove('hidden');
        window.abrirModalVerificar();
    }
}
window.navigateTo = function(view) { window.menuAction(view); }


// ==========================================
// 3. LÓGICA DE COMPRA Y CÁLCULOS
// ==========================================

window.selectQty = function(n, btn) {
    document.querySelectorAll('.qty-btn').forEach(b => { b.classList.remove('qty-btn-selected'); });
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
    // OBTENER PRECIO DINÁMICO DEL INPUT OCULTO
    let priceInput = document.getElementById('raffle-price');
    let price = priceInput ? parseFloat(priceInput.value) : 0; 
    
    let total = val * price;
    let text = "Bs. " + total.toLocaleString('es-VE', {minimumFractionDigits: 2});
    
    const el2 = document.getElementById('step2-total');
    const el4 = document.getElementById('step4-total');
    const elS = document.getElementById('success-total');
    
    if(el2) el2.innerText = text;
    if(el4) el4.innerText = text;
    if(elS) elS.innerText = text;
}

window.previewImage = function(input) {
    if (input.files && input.files[0]) {
        document.getElementById('upload-placeholder').classList.add('hidden');
        document.getElementById('file-preview').classList.remove('hidden');
    }
}

window.copiarTexto = function(texto) {
    navigator.clipboard.writeText(texto).then(() => {
        const Toast = Swal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 1500 });
        Toast.fire({ icon: 'success', title: 'Copiado' });
    });
}

// --- MODALES ---

window.abrirModalCompra = function() {
    const btn = document.querySelector('button[onclick="abrirModalCompra()"]');
    if (btn && (btn.disabled)) return; // Si está deshabilitado no abre

    const modal = document.getElementById('checkoutModal');
    if (modal) {
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        currentStep = 1;
        window.mostrarPaso(1);
    }
}

window.cerrarModalCompra = function() {
    const modal = document.getElementById('checkoutModal');
    const pasoExito = document.getElementById('step-success');
    
    // Si ya compró, recargar página al cerrar
    if (!pasoExito.classList.contains('hidden')) {
        location.reload();
        return; 
    }
    
    if (modal) modal.classList.add('hidden');
    document.body.style.overflow = 'auto';
    liberarTickets(); // Liberar si cerró sin comprar
}

window.abrirModalVerificar = function() { document.getElementById('checkTicketsModal').classList.remove('hidden'); }
window.cerrarModalVerificar = function() { document.getElementById('checkTicketsModal').classList.add('hidden'); }

window.mostrarPaso = function(paso) {
    for(let i=1; i<=5; i++){
        const el = document.getElementById(`step-${i}`);
        if(el) el.classList.add('hidden');
    }
    const actual = document.getElementById(`step-${paso}`);
    if(actual) actual.classList.remove('hidden');
    window.updateModalHeader();
}

window.updateModalHeader = function() {
    const titles = ["Método de Pago", "Cantidad de Boletos", "Datos Personales", "Realiza el Pago", "Comprobante de Pago"];
    const icons = ["solar:card-2-bold-duotone", "solar:ticket-bold-duotone", "solar:user-bold-duotone", "solar:wallet-money-bold-duotone", "solar:upload-track-bold-duotone"];
    
    const titleEl = document.getElementById('header-title');
    if(titleEl) titleEl.innerText = titles[currentStep - 1];
    
    const stepEl = document.getElementById('header-step');
    if(stepEl) stepEl.innerText = `Paso ${currentStep} de 5`;
    
    const iconEl = document.getElementById('header-icon');
    if(iconEl) iconEl.setAttribute('icon', icons[currentStep - 1]);
    
    const prog = document.getElementById('progress-bar');
    if(prog) prog.style.width = `${currentStep * 20}%`;

    const btnBack = document.getElementById('btn-back');
    if(btnBack) {
        if(currentStep === 1) { btnBack.disabled = true; btnBack.classList.add('opacity-50'); }
        else { btnBack.disabled = false; btnBack.classList.remove('opacity-50'); }
    }

    const btnNext = document.getElementById('btn-next');
    if(btnNext) {
        if(currentStep === 5) btnNext.innerHTML = `Finalizar <iconify-icon icon="solar:check-circle-bold"></iconify-icon>`;
        else btnNext.innerHTML = `Continuar <iconify-icon icon="solar:arrow-right-bold"></iconify-icon>`;
    }
}

window.prevStep = function() {
    if (currentStep > 1) {
        document.getElementById(`step-${currentStep}`).classList.add('hidden');
        currentStep--;
        document.getElementById(`step-${currentStep}`).classList.remove('hidden');
        window.updateModalHeader();
    }
}

window.dismissInstructions = function() {
    document.getElementById('payment-instructions').classList.add('hidden');
    document.getElementById(`step-4`).classList.add('hidden');
    currentStep = 5;
    document.getElementById(`step-5`).classList.remove('hidden');
    window.updateModalHeader();
}

// Alerta Stock Sutil
window.cerrarAlertaStock = function() { document.getElementById('modal-stock-sutil').classList.add('hidden'); }
window.mostrarAlertaStock = function(pedidos, disponibles) {
    document.getElementById('stock-pedido-val').innerText = pedidos;
    document.getElementById('stock-disponible-val').innerText = disponibles;
    document.getElementById('modal-stock-sutil').classList.remove('hidden');
}


// ==========================================
// 4. VALIDACIÓN DE STOCK REAL
// ==========================================

async function validarStockReal() {
    // Usar el ID del sorteo cargado dinámicamente
    const raffleId = document.getElementById('raffle-id').value;
    const cantidadSolicitada = parseInt(document.getElementById('custom-qty').value, 10);
    
    if (!raffleId) {
        Swal.fire('Error', 'No se ha cargado la información del sorteo.', 'error');
        return false;
    }

    if (!cantidadSolicitada || cantidadSolicitada <= 0) {
        Swal.fire('Error', 'Selecciona al menos 1 boleto.', 'error');
        return false;
    }

    const { count, error } = await supabaseClient
        .from('tickets')
        .select('*', { count: 'exact', head: true })
        .eq('id_sorteo', raffleId) // 🔥 Solo del sorteo actual
        .eq('estado', 'disponible');

    if (error) { console.error("Error DB:", error); return false; }

    const stockReal = Number(count);
    if (stockReal < cantidadSolicitada) {
        window.mostrarAlertaStock(cantidadSolicitada, stockReal);
        return false;
    }

    return await reservarTicketsEnDB(cantidadSolicitada, raffleId);
}

async function reservarTicketsEnDB(cantidad, raffleId) {
    try {
        const { data: ticketsLibres, error } = await supabaseClient
            .from('tickets')
            .select('id, numero')
            .eq('id_sorteo', raffleId)
            .eq('estado', 'disponible')
            .limit(cantidad);

        if (error || !ticketsLibres || ticketsLibres.length < cantidad) {
            Swal.fire({ icon: 'warning', title: 'Boletos agotados', text: 'Intenta de nuevo.' });
            return false;
        }

        const ids = ticketsLibres.map(t => t.id);
        // Bloquear temporalmente
        await supabaseClient.from('tickets').update({ estado: 'bloqueado' }).in('id', ids);

        ticketsReservados = ticketsLibres;
        return true;

    } catch (e) { console.error(e); return false; }
}

// ==========================================
// 5. CONTROL DE PASOS Y SUBIDA
// ==========================================

window.nextStep = async function() {
    // Paso 1: Método
    if(currentStep === 1) {
        const method = document.querySelector('input[name="payment_method"]:checked');
        if(!method) { Swal.fire({ icon: 'error', text: 'Selecciona un método de pago.' }); return; }
    }

    // Paso 2: Cantidad y Stock
    if(currentStep === 2) {
        const btn = document.getElementById('btn-next');
        const txt = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verificando...';
        btn.disabled = true;

        const check = await validarStockReal();
        
        btn.innerHTML = txt;
        btn.disabled = false;

        if (!check) return; 

        iniciarTimer();
    }

    // Paso 3: Datos
    if(currentStep === 3) {
        const name = document.getElementById('input-name').value;
        const cedula = document.getElementById('input-cedula').value;
        const phone = document.getElementById('input-phone').value;
        const email = document.getElementById('input-email').value;
        if(!name || !cedula || !phone || !email) { Swal.fire({ icon: 'warning', text: 'Completa todos los datos.' }); return; }
    }

    // Avance normal
    if (currentStep < 5) {
        if (currentStep === 4) {
            document.getElementById('payment-instructions').classList.remove('hidden');
            return; 
        }
        
        document.getElementById(`step-${currentStep}`).classList.add('hidden');
        currentStep++; 
        document.getElementById(`step-${currentStep}`).classList.remove('hidden');
        window.updateModalHeader();
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
        sec = sec < 10 ? '0' + sec : sec;
        const el = document.getElementById('countdown');
        if(el) el.innerText = `${min}:${sec}`;

        if (timeLeft <= 0) {
            clearInterval(intervaloTimer);
            liberarTickets();
            Swal.fire({ title: 'Tiempo Agotado', icon: 'error', confirmButtonText: 'Reiniciar' }).then(() => location.reload());
        }
        timeLeft--;
    }, 1000);
}

async function liberarTickets() {
    if (ticketsReservados.length === 0) return;
    const ids = ticketsReservados.map(t => t.id);
    await supabaseClient.from('tickets').update({ estado: 'disponible' }).in('id', ids);
    ticketsReservados = [];
}

async function subirComprobante(file) {
    const fileName = `${Date.now()}.${file.name.split('.').pop()}`;
    // Usar bucket 'comprobantes'
    const { error } = await supabaseClient.storage.from('comprobantes').upload(fileName, file);
    if (error) throw error;
    
    // Obtener URL pública
    const { data } = supabaseClient.storage.from('comprobantes').getPublicUrl(fileName);
    return data.publicUrl;
}

async function procesarCompraFinal() {
    const ref = document.getElementById('input-referencia').value;
    const file = document.getElementById('input-comprobante');
    
    if (!ref || ref.length < 4) { Swal.fire({ icon: 'error', text: 'Falta referencia correcta.' }); return; }
    if (!file.files.length) { Swal.fire({ icon: 'error', text: 'Falta subir el comprobante.' }); return; }

    Swal.fire({ title: 'Procesando...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        const urlImagen = await subirComprobante(file.files[0]);
        const nombre = document.getElementById('input-name').value;
        const cedula = document.getElementById('input-cedula').value;
        
        // Unir código de país y teléfono
        const countryCode = document.getElementById('input-country-code') ? document.getElementById('input-country-code').value : '+58';
        const phoneRaw = document.getElementById('input-phone').value;
        const telefono = countryCode + phoneRaw;

        const email = document.getElementById('input-email').value;
        const cantidad = parseInt(document.getElementById('custom-qty').value);
        const raffleId = document.getElementById('raffle-id').value;

        // Calcular monto final limpio
        let montoTexto = document.getElementById('step4-total').innerText;
        let montoFinal = parseFloat(montoTexto.replace('Bs.', '').replace(/\./g, '').replace(',', '.').trim());

        // 1. Crear Orden
        const { data: orden, error } = await supabaseClient
            .from('ordenes')
            .insert([{
                id_sorteo: raffleId, // Asociar al sorteo actual
                nombre, cedula, telefono, email,
                metodo_pago: 'pago_movil',
                referencia_pago: ref,
                url_comprobante: urlImagen,
                monto_total: montoFinal,
                cantidad_boletos: cantidad,
                estado: 'pendiente_validacion'
            }])
            .select().single();

        if (error) throw error;

        // 2. Asignar Tickets a la Orden y ponerlos en 'pendiente'
        const ids = ticketsReservados.map(t => t.id);
        const numeros = ticketsReservados.map(t => t.numero);

        await supabaseClient
            .from('tickets')
            .update({ estado: 'pendiente', id_orden: orden.id })
            .in('id', ids);

        ticketsReservados = [];
        clearInterval(intervaloTimer);
        Swal.close();

        // 3. Mostrar Éxito
        const container = document.getElementById('assigned-tickets');
        if(container) {
            container.innerHTML = numeros.map(n => 
                `<span class="bg-red-100 text-red-700 font-bold px-3 py-1 rounded-lg text-sm border border-red-200">${n}</span>`
            ).join('');
        }
        
        const successTotal = document.getElementById('success-total');
        if(successTotal) successTotal.innerText = montoTexto;

        document.getElementById('step-5').classList.add('hidden');
        document.getElementById('modal-footer').classList.add('hidden');
        document.getElementById('step-success').classList.remove('hidden');
        confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });

    } catch (err) {
        console.error(err);
        Swal.fire('Error', 'Hubo un error al procesar. Contacta a soporte.', 'error');
    }
}


// ==========================================
// 6. CONSULTA DE TICKETS (VERIFICACIÓN)
// ==========================================

window.consultarTicketsReales = async function() {
    const cedulaInput = document.getElementById('cedula-consult'); // Asegurate que el ID en HTML sea este
    // Si tu HTML tiene otro ID para el input de cédula en el modal de verificar, ajústalo aquí.
    // En tu código HTML anterior vi: <input type="number" id="cedula-consult" ... >
    
    if(!cedulaInput) {
        // Fallback por si el ID en HTML es diferente
        const inputs = document.querySelectorAll('#search-inputs input');
        if(inputs.length > 0) cedulaInput = inputs[0]; 
    }
    
    const cedula = cedulaInput ? cedulaInput.value : '';

    if(!cedula) return Swal.fire('Error', 'Ingresa tu cédula', 'warning');
    
    const resultsDiv = document.getElementById('ticket-results');
    resultsDiv.innerHTML = '<p class="text-center text-gray-400 py-4"><iconify-icon icon="line-md:loading-loop" width="24"></iconify-icon><br>Buscando...</p>';
    resultsDiv.classList.remove('hidden');

    // Buscar Ordenes
    const { data: ordenes } = await supabaseClient
        .from('ordenes')
        .select('*')
        .eq('cedula', cedula)
        .order('creado_en', {ascending:false});
    
    if(!ordenes || ordenes.length === 0) {
        resultsDiv.innerHTML = '<div class="p-4 text-center"><iconify-icon icon="solar:confounded-square-bold-duotone" class="text-gray-300 text-4xl mb-2"></iconify-icon><p class="text-xs text-gray-500">No encontramos compras registradas con esa cédula.</p></div>';
        return;
    }

    let html = '';
    for (let orden of ordenes) {
        // Buscar tickets de esa orden
        const { data: tickets } = await supabaseClient.from('tickets').select('numero').eq('id_orden', orden.id);
        
        let nums = 'Pendientes';
        if(tickets && tickets.length > 0) {
            nums = tickets.map(t => `<span class="bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200">${t.numero}</span>`).join(' ');
        }
        
        let color = orden.estado === 'aprobado' ? 'green' : (orden.estado === 'rechazado' ? 'red' : 'yellow');
        let icon = orden.estado === 'aprobado' ? 'solar:check-circle-bold' : (orden.estado === 'rechazado' ? 'solar:close-circle-bold' : 'solar:clock-circle-bold');
        let estadoTxt = orden.estado === 'aprobado' ? 'APROBADO' : (orden.estado === 'rechazado' ? 'RECHAZADO' : 'VERIFICANDO');
        let fecha = new Date(orden.creado_en).toLocaleDateString('es-VE');

        html += `
            <div class="bg-white rounded-2xl p-4 text-left border border-gray-100 shadow-sm mb-3 relative overflow-hidden">
                <div class="absolute top-0 right-0 w-16 h-16 bg-${color}-50 rounded-bl-full -mr-8 -mt-8 z-0"></div>
                
                <div class="relative z-10 flex items-center gap-3 mb-3 border-b border-gray-50 pb-3">
                    <div class="w-10 h-10 bg-${color}-100 rounded-full flex items-center justify-center text-${color}-600 flex-shrink-0 shadow-sm">
                        <iconify-icon icon="${icon}" width="20"></iconify-icon>
                    </div>
                    <div>
                        <h4 class="font-bold text-gray-800 text-xs">Orden #${orden.id.toString().slice(0,6)}</h4>
                        <p class="text-[9px] font-black text-${color}-500 uppercase tracking-wide bg-${color}-50 px-1.5 rounded inline-block mt-0.5">${estadoTxt}</p>
                    </div>
                    <div class="ml-auto text-right">
                        <span class="text-[10px] text-gray-400 font-medium block">${fecha}</span>
                        <span class="font-black text-gray-800 text-sm">Bs. ${orden.monto_total}</span>
                    </div>
                </div>
                
                <div class="relative z-10">
                    <p class="text-[10px] font-bold text-gray-400 uppercase mb-1.5 flex items-center gap-1"><iconify-icon icon="solar:ticket-sale-bold"></iconify-icon> Boletos Asignados:</p>
                    <div class="flex flex-wrap gap-1.5 text-xs font-mono text-gray-600 font-bold leading-relaxed">
                        ${nums}
                    </div>
                </div>
            </div>
        `;
    }
    resultsDiv.innerHTML = html;
}
