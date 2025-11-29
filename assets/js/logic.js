// CONFIGURACIÓN DE PRECIOS
const PRECIO_UNITARIO = 700.00; 
let currentStep = 1;
const totalSteps = 5;
let cantidadBoletos = 1;
let totalPagar = PRECIO_UNITARIO;
let timerInterval;

// INICIAR
document.addEventListener('DOMContentLoaded', () => {
    updateUI();
});

// NAVEGACIÓN
function nextStep() {
    if (currentStep < totalSteps) {
        // Validar paso 3 (Datos)
        if (currentStep === 3 && !validarDatos()) return;
        
        currentStep++;
        updateUI();
        
        // Iniciar timer en paso 4
        if (currentStep === 4) startTimer();
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

// ACTUALIZAR PANTALLA
function updateUI() {
    // Ocultar todos los pasos
    document.querySelectorAll('.step-content').forEach(el => el.classList.add('hidden'));
    // Mostrar actual
    document.getElementById(`step-${currentStep}`).classList.remove('hidden');
    
    // Barra de progreso
    document.getElementById('progress-bar').style.width = `${(currentStep / totalSteps) * 100}%`;
    
    // Textos Header
    const titles = ["Método de Pago", "Cantidad de Boletos", "Datos Personales", "Realizar Pago", "Comprobante"];
    const icons = ["card-2-bold-duotone", "ticket-bold-duotone", "user-id-bold-duotone", "smartphone-2-bold-duotone", "bill-check-bold-duotone"];
    
    document.getElementById('header-title').innerText = titles[currentStep - 1];
    document.getElementById('header-step').innerText = `Paso ${currentStep} de 5`;
    document.getElementById('header-icon').setAttribute('icon', `solar:${icons[currentStep - 1]}`);
    
    // Botones
    document.getElementById('btn-back').disabled = (currentStep === 1);
    const btnNext = document.getElementById('btn-next');
    
    if (currentStep === totalSteps) {
        btnNext.innerHTML = 'Finalizar Compra <iconify-icon icon="solar:check-circle-bold"></iconify-icon>';
        btnNext.className = "px-8 py-3 bg-green-500 hover:bg-green-600 text-white rounded-xl font-bold shadow-lg shadow-green-200 text-sm flex items-center gap-2";
    } else {
        btnNext.innerHTML = 'Continuar <iconify-icon icon="solar:arrow-right-bold"></iconify-icon>';
        btnNext.className = "px-8 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold shadow-lg shadow-red-200 text-sm flex items-center gap-2";
    }

    // Mostrar/Ocultar Timer
    const timer = document.getElementById('timer-container');
    currentStep >= 4 ? timer.classList.remove('hidden') : timer.classList.add('hidden');
}

// LÓGICA CANTIDAD (PASO 2)
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

// TIMER (PASO 4)
function startTimer() {
    if (timerInterval) return;
    let duration = 15 * 60; // 15 minutos
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

// VALIDACION (PASO 3)
function validarDatos() {
    const name = document.getElementById('input-name').value;
    const cedula = document.getElementById('input-cedula').value;
    const phone = document.getElementById('input-phone').value;
    if(!name || !cedula || !phone) {
        alert("Por favor llena los campos obligatorios (*)");
        return false;
    }
    return true;
}

// EXITO (PASO FINAL)
function mostrarExito() {
    document.getElementById('step-5').classList.add('hidden');
    document.getElementById('modal-footer').classList.add('hidden');
    document.getElementById('header-step').innerText = "Proceso Completado";
    document.getElementById('progress-bar').style.width = "100%";
    document.getElementById('timer-container').classList.add('hidden');
    
    document.getElementById('step-success').classList.remove('hidden');
    
    // Generar tickets aleatorios
    const container = document.getElementById('assigned-tickets');
    container.innerHTML = '';
    for(let i=0; i<cantidadBoletos; i++) {
        let ticket = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
        container.innerHTML += `<span class="bg-green-500 text-white text-xs font-bold px-2 py-1 rounded">${ticket}</span>`;
    }
}

// SUBIR IMAGEN (PREVIEW)
function previewImage(input) {
    if (input.files && input.files[0]) {
        document.getElementById('upload-placeholder').classList.add('hidden');
        document.getElementById('file-preview').classList.remove('hidden');
    }
}
