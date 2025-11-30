const PRECIO_UNITARIO = 700.00; 
let currentStep = 1;
const totalSteps = 5;
let cantidadBoletos = 1;
let totalPagar = PRECIO_UNITARIO;
let timerInterval;
let paymentInstructionsShown = false; // Control del cartel azul

document.addEventListener('DOMContentLoaded', () => { updateUI(); });

function nextStep() {
    if (currentStep < totalSteps) {
        if (currentStep === 3 && !validarDatos()) return;
        
        currentStep++;
        
        // Timer inicia al entrar al paso 3
        if (currentStep === 3) startTimer();
        
        updateUI();
    } else {
        mostrarExito();
    }
}

function prevStep() {
    if (currentStep > 1) {
        currentStep--;
        updateUI();
    }
}

function updateUI() {
    // Resetear visibilidad y desenfoque
    document.querySelectorAll('.step-content').forEach(el => {
        el.classList.add('hidden');
        el.classList.remove('blur-content');
    });

    // Mostrar paso actual
    const currentContent = document.getElementById(`step-${currentStep}`);
    currentContent.classList.remove('hidden');

    // --- LÓGICA CARTEL INSTRUCCIONES (PASO 4) ---
    const instructionsOverlay = document.getElementById('payment-instructions');
    const modalFooter = document.getElementById('modal-footer');

    if (currentStep === 4 && !paymentInstructionsShown) {
        instructionsOverlay.classList.remove('hidden'); // Mostrar cartel
        modalFooter.classList.add('hidden');            // Ocultar botones
        currentContent.classList.add('blur-content');   // Desenfocar datos
    } else {
        instructionsOverlay.classList.add('hidden');    // Ocultar cartel
        modalFooter.classList.remove('hidden');         // Mostrar botones
    }

    // Barra de progreso
    document.getElementById('progress-bar').style.width = `${(currentStep / totalSteps) * 100}%`;
    
    const titles = ["Método de Pago", "Cantidad de Boletos", "Datos Personales", "Realizar Pago", "Comprobante"];
    const icons = ["card-2-bold-duotone", "ticket-bold-duotone", "user-id-bold-duotone", "smartphone-2-bold-duotone", "bill-check-bold-duotone"];
    
    document.getElementById('header-title').innerText = titles[currentStep - 1];
    document.getElementById('header-step').innerText = `Paso ${currentStep} de 5`;
    document.getElementById('header-icon').setAttribute('icon', `solar:${icons[currentStep - 1]}`);
    
    document.getElementById('btn-back').disabled = (currentStep === 1);
    const btnNext = document.getElementById('btn-next');
    
    if (currentStep === totalSteps) {
        btnNext.innerHTML = 'Finalizar <iconify-icon icon="solar:check-circle-bold"></iconify-icon>';
        btnNext.className = "px-8 py-3 bg-green-500 hover:bg-green-600 text-white rounded-xl font-bold shadow-lg shadow-green-200 text-sm flex items-center gap-2";
    } else {
        btnNext.innerHTML = 'Continuar <iconify-icon icon="solar:arrow-right-bold"></iconify-icon>';
        btnNext.className = "px-8 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold shadow-lg shadow-red-200 text-sm flex items-center gap-2";
    }

    // Timer visible desde paso 3 en adelante (excepto éxito)
    const timer = document.getElementById('timer-container');
    (currentStep >= 3 && currentStep < 6) ? timer.classList.remove('hidden') : timer.classList.add('hidden');
}

// Función para cerrar el cartel de instrucciones
function dismissInstructions() {
    paymentInstructionsShown = true;
    updateUI();
}

function selectQty(qty) {
    cantidadBoletos = qty;
    document.getElementById('custom-qty').value = qty;
    updateTotal();
}

function changeQty(delta) {
    let val = parseInt(document.getElementById('custom-qty').value) + delta;
    if (val < 1) val = 1;
    selectQty(val);
}

function updateTotal() {
    let val = parseInt(document.getElementById('custom-qty').value);
    if (isNaN(val) || val < 1) val = 1;
    cantidadBoletos = val;
    totalPagar = val * PRECIO_UNITARIO;
    
    const textoTotal = `Bs. ${totalPagar.toLocaleString('es-VE', {minimumFractionDigits: 2})}`;
    document.getElementById('step2-total').innerText = textoTotal;
    document.getElementById('step4-total').innerText = textoTotal;
    document.getElementById('success-total').innerText = textoTotal;
}

function startTimer() {
    if (timerInterval) return;
    let duration = 15 * 60;
    const display = document.getElementById('countdown');
    
    timerInterval = setInterval(() => {
        let min = parseInt(duration / 60, 10);
        let sec = parseInt(duration % 60, 10);
        min = min < 10 ? "0" + min : min;
        sec = sec < 10 ? "0" + sec : sec;
        display.textContent = min + ":" + sec;
        
        if (--duration < 0) {
            clearInterval(timerInterval);
            alert("Tiempo expirado");
            location.reload();
        }
    }, 1000);
}

function validarDatos() {
    const name = document.getElementById('input-name').value;
    const cedula = document.getElementById('input-cedula').value;
    const phone = document.getElementById('input-phone').value;
    if(!name || !cedula || !phone) { alert("Completa los campos obligatorios"); return false; }
    return true;
}

function mostrarExito() {
    document.getElementById('step-5').classList.add('hidden');
    document.getElementById('modal-footer').classList.add('hidden');
    document.getElementById('header-step').innerText = "Proceso Completado";
    document.getElementById('progress-bar').style.width = "100%";
    document.getElementById('timer-container').classList.add('hidden');
    document.getElementById('step-success').classList.remove('hidden');
    
    const container = document.getElementById('assigned-tickets');
    container.innerHTML = '';
    for(let i=0; i<cantidadBoletos; i++) {
        let ticket = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
        container.innerHTML += `<span class="bg-green-500 text-white text-xs font-bold px-2 py-1 rounded">${ticket}</span>`;
    }

    // LANZAR CONFETI: Ahora se lanza desde el centro de la pantalla
    lanzarConfeti();
}

// Función actualizada para una gran explosión desde el centro
function lanzarConfeti() {
    var myCanvas = document.getElementById('confetti-canvas');
    var myConfetti = confetti.create(myCanvas, { resize: true, useWorker: true });
    
    // Configuración de la explosión
    const explosionConfig = {
        particleCount: 200, // Cantidad de partículas
        spread: 160,        // Dispersión amplia
        origin: { y: 0.5 }, // Desde el centro vertical (x es 0.5 por defecto)
        zIndex: 9999,       // Asegurar que esté por encima del modal
        colors: ['#ef4444', '#3b82f6', '#10b981', '#f59e0b']
    };

    // Primera ráfaga
    myConfetti(explosionConfig);

    // Segunda ráfaga con un ligero retraso para un efecto más festivo
    setTimeout(() => {
        myConfetti({
            ...explosionConfig,
            particleCount: 150, // Un poco menos de partículas
            startVelocity: 45,  // Un poco más de velocidad inicial
        });
    }, 250); // 250ms de retraso
}

function previewImage(input) {
    if (input.files && input.files[0]) {
        document.getElementById('upload-placeholder').classList.add('hidden');
        document.getElementById('file-preview').classList.remove('hidden');
    }
}

function simularBusquedaTickets() {
    document.getElementById('search-inputs').classList.add('hidden');
    document.getElementById('ticket-results').classList.remove('hidden');
    document.getElementById('consult-title').innerText = "Tus Compras";
    document.getElementById('consult-subtitle').innerText = "Resultados para la cédula ingresada";
}
