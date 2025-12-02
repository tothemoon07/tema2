// client_logic.js - LÓGICA MAESTRA UNIFICADA

// ⚠️ TUS CLAVES
const SUPABASE_URL = 'https://tpzuvrvjtxuvmyusjmpq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRwenV2cnZqdHh1dm15dXNqbXBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1NDMwMDAsImV4cCI6MjA4MDExOTAwMH0.YcGZLy7W92H0o0TN4E_v-2PUDtcSXhB-D7x7ob6TTp4';

const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

// Variables Globales
let currentStep = 1; // Definimos aquí el paso inicial
let ticketsReservados = []; 
let intervaloTimer = null;

// ==========================================
// 1. FUNCIONES UI (MENÚS Y BOTONES)
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
    window.toggleMenu(); // Cerrar menú
    // Ocultar vistas
    document.getElementById('view-home').classList.add('hidden');
    document.getElementById('view-raffles').classList.add('hidden');
    document.getElementById('view-terms').classList.add('hidden');
    document.getElementById('floating-btn').classList.add('hidden');
    window.scrollTo(0,0);

    if (action === 'home') {
        document.getElementById('view-home').classList.remove('hidden');
        document.getElementById('floating-btn').classList.remove('hidden');
    } else if (action === 'raffles') {
        document.getElementById('view-raffles').classList.remove('hidden');
    } else if (action === 'terms') {
        document.getElementById('view-terms').classList.remove('hidden');
    } else if (action === 'verify') {
        document.getElementById('view-home').classList.remove('hidden');
        window.abrirModalVerificar();
    }
}

window.navigateTo = function(view) { window.menuAction(view); }

// --- FUNCIONES DE CANTIDAD Y PRECIOS ---

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
    let price = 700; // PRECIO FIJO
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
    // Check de seguridad visual
    const btn = document.querySelector('button[onclick="abrirModalCompra()"]');
    if (btn && (btn.disabled || btn.innerText.includes('AGOTADO'))) return;

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
    if (modal) modal.classList.add('hidden');
    document.body.style.overflow = 'auto';
    liberarTickets(); // IMPORTANTE: Liberar si cancela
}

window.abrirModalVerificar = function() {
    document.getElementById('checkTicketsModal').classList.remove('hidden');
}

window.cerrarModalVerificar = function() {
    document.getElementById('checkTicketsModal').classList.add('hidden');
}

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

// ==========================================
// 2. LÓGICA DE SEGURIDAD (VALIDACIÓN STOCK)
// ==========================================

async function validarStockReal() {
    const inputElement = document.getElementById('custom-qty');
    const cantidadSolicitada = parseInt(inputElement.value, 10);
    
    if (!cantidadSolicitada || cantidadSolicitada <= 0) {
        Swal.fire('Error', 'Selecciona al menos 1 boleto.', 'error');
        return false;
    }

    // CONSULTA A DB
    const { count, error } = await supabaseClient
        .from('tickets')
        .select('*', { count: 'exact', head: true })
        .eq('estado', 'disponible');

    if (error) {
        console.error("Error DB:", error);
        return false;
    }

    const stockReal = Number(count);

    // BLOQUEO AGRESIVO
    if (stockReal < cantidadSolicitada) {
        Swal.fire({
            icon: 'error',
            title: '¡STOCK INSUFICIENTE!',
            html: `
                <div style="text-align: left;">
                    <p>⛔ <b>No puedes avanzar.</b></p>
                    <p>Pediste: <b style="color: red;">${cantidadSolicitada}</b></p>
                    <p>Quedan: <b style="color: green;">${stockReal}</b></p>
                    <br><small>Por favor reduce la cantidad.</small>
                </div>
            `,
            confirmButtonColor: '#d33',
            confirmButtonText: 'Entendido'
        });
        return false;
    }

    return await reservarTicketsEnDB(cantidadSolicitada);
}

async function reservarTicketsEnDB(cantidad) {
    try {
        const { data: ticketsLibres, error } = await supabaseClient
            .from('tickets')
            .select('id, numero')
            .eq('estado', 'disponible')
            .limit(cantidad);

        if (error || !ticketsLibres || ticketsLibres.length < cantidad) {
            Swal.fire('Ups', 'Esos boletos ya se vendieron.', 'warning');
            return false;
        }

        const ids = ticketsLibres.map(t => t.id);
        await supabaseClient.from('tickets').update({ estado: 'bloqueado' }).in('id', ids);

        ticketsReservados = ticketsLibres;
        return true;

    } catch (e) { console.error(e); return false; }
}

// ==========================================
// 3. CONTROLADOR PRINCIPAL (NEXT STEP)
// ==========================================

window.nextStep = async function() {
    
    // PASO 1 (MÉTODO PAGO)
    if(currentStep === 1) {
        const method = document.querySelector('input[name="payment_method"]:checked');
        if(!method) { Swal.fire({ icon: 'error', text: 'Selecciona un método de pago.' }); return; }
    }

    // PASO 2 (CANTIDAD) - AQUÍ ESTÁ EL BLOQUEO
    if(currentStep === 2) {
        const btn = document.getElementById('btn-next');
        const txt = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verificando...';
        btn.disabled = true;

        const check = await validarStockReal();
        
        btn.innerHTML = txt;
        btn.disabled = false;

        if (!check) return; // SI FALLA, SE DETIENE AQUÍ

        iniciarTimer();
    }

    // PASO 3 (DATOS)
    if(currentStep === 3) {
        const name = document.getElementById('input-name').value;
        const cedula = document.getElementById('input-cedula').value;
        const phone = document.getElementById('input-phone').value;
        const email = document.getElementById('input-email').value;
        if(!name || !cedula || !phone || !email) { Swal.fire({ icon: 'warning', text: 'Completa todos los datos.' }); return; }
    }

    // AVANCE
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

// ==========================================
// 4. UTILIDADES FINALES
// ==========================================

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
    const { error } = await supabaseClient.storage.from('comprobantes').upload(fileName, file);
    if (error) throw error;
    const { data } = supabaseClient.storage.from('comprobantes').getPublicUrl(fileName);
    return data.publicUrl;
}

async function procesarCompraFinal() {
    const ref = document.getElementById('input-referencia').value;
    const file = document.getElementById('input-comprobante');
    
    if (!ref || ref.length < 4) { Swal.fire({ icon: 'error', text: 'Falta referencia.' }); return; }
    if (!file.files.length) { Swal.fire({ icon: 'error', text: 'Falta comprobante.' }); return; }

    Swal.fire({ title: 'Procesando...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        const urlImagen = await subirComprobante(file.files[0]);

        // Datos del formulario
        const nombre = document.getElementById('input-name').value;
        const cedula = document.getElementById('input-cedula').value;
        const telefono = document.getElementById('input-country-code').value + document.getElementById('input-phone').value;
        const email = document.getElementById('input-email').value;
        const cantidad = parseInt(document.getElementById('custom-qty').value);
        let montoTexto = document.getElementById('step4-total').innerText;
        let montoFinal = parseFloat(montoTexto.replace('Bs.', '').replace(/\./g, '').replace(',', '.').trim());

        const { data: orden, error } = await supabaseClient
            .from('ordenes')
            .insert([{
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

        // Asignar tickets
        const ids = ticketsReservados.map(t => t.id);
        const numeros = ticketsReservados.map(t => t.numero);

        await supabaseClient.from('tickets').update({ estado: 'pendiente', id_orden: orden.id }).in('id', ids);

        ticketsReservados = [];
        clearInterval(intervaloTimer);
        Swal.close();

        // Mostrar Éxito
        const container = document.getElementById('assigned-tickets');
        if(container) {
            container.innerHTML = numeros.map(n => 
                `<span class="bg-red-100 text-red-700 font-bold px-3 py-1 rounded-lg text-sm border border-red-200">${n}</span>`
            ).join('');
        }

        document.getElementById('step-5').classList.add('hidden');
        document.getElementById('modal-footer').classList.add('hidden');
        document.getElementById('step-success').classList.remove('hidden');
        confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });

    } catch (err) {
        console.error(err);
        Swal.fire('Error', 'Hubo un error. Contacta soporte.', 'error');
    }
}

// Carga Inicial
window.onload = async function() {
    try {
        const { count } = await supabaseClient.from('tickets')
            .select('*', { count: 'exact', head: true })
            .eq('estado', 'disponible');
        
        console.log(`Carga inicial: ${count} disponibles.`);
        
        if (count === 0) {
            const btns = document.querySelectorAll('button[onclick="abrirModalCompra()"]');
            btns.forEach(b => { 
                b.disabled = true; 
                b.innerHTML = '<i class="fas fa-lock"></i> AGOTADO'; 
                b.classList.add('bg-gray-400');
                b.classList.remove('bg-red-600', 'hover:bg-red-700');
            });
        }
    } catch(e) { console.error(e); }
};
