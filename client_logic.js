// client_logic.js - Lógica de compra para el usuario

// ⚠️ TUS CLAVES DE SUPABASE
const SUPABASE_URL = 'https://tpzuvrvjtxuvmyusjmpq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRwenV2cnZqdHh1dm15dXNqbXBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1NDMwMDAsImV4cCI6MjA4MDExOTAwMH0.YcGZLy7W92H0o0TN4E_v-2PUDtcSXhB-D7x7ob6TTp4';

const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

// Variables temporales de la compra
let compraActual = {
    cantidad: 1,
    monto: 700,
    metodo: '',
    ticketsReservados: [] // Aquí guardaremos los IDs si implementamos bloqueo estricto
};

// 1. INICIAR PROCESO DE PAGO (Paso 1 -> Paso 2)
// Esta función se llama cuando seleccionan método de pago y cantidad
function actualizarDatosCompra(qty, total) {
    compraActual.cantidad = qty;
    compraActual.monto = total;
    console.log("Compra actualizada:", compraActual);
}

// 2. SUBIR COMPROBANTE (Paso 5)
async function subirComprobante(file) {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}.${fileExt}`;
    const filePath = `${fileName}`;

    // Subir a Supabase Storage ('comprobantes' es el bucket que creamos)
    const { data, error } = await supabaseClient.storage
        .from('comprobantes')
        .upload(filePath, file);

    if (error) {
        console.error('Error subiendo imagen:', error);
        throw error;
    }

    // Obtener URL pública para guardarla en la base de datos
    const { data: { publicUrl } } = supabaseClient.storage
        .from('comprobantes')
        .getPublicUrl(filePath);

    return publicUrl;
}

// 3. FINALIZAR COMPRA (Guardar en Base de Datos)
async function procesarCompraFinal() {
    const nombre = document.getElementById('input-name').value;
    const cedula = document.getElementById('input-cedula').value;
    const countryCode = document.getElementById('input-country-code').value;
    const phoneBase = document.getElementById('input-phone').value;
    const email = document.getElementById('input-email').value;
    const referencia = document.getElementById('input-referencia').value;
    const fileInput = document.getElementById('input-comprobante');
    const metodo = document.querySelector('input[name="payment_method"]:checked')?.value || 'pago_movil';

    if (!fileInput.files || fileInput.files.length === 0) {
        alert("Por favor selecciona la imagen del comprobante");
        return false;
    }

    try {
        // A. Subir imagen primero
        const urlImagen = await subirComprobante(fileInput.files[0]);

        // B. Crear Orden en Base de Datos
        const { data, error } = await supabaseClient
            .from('ordenes')
            .insert([
                {
                    nombre: nombre,
                    cedula: cedula,
                    telefono: `${countryCode}${phoneBase}`,
                    email: email,
                    metodo_pago: metodo,
                    referencia_pago: referencia,
                    url_comprobante: urlImagen,
                    monto_total: document.getElementById('step4-total').innerText, // Guardamos el texto (ej: Bs 700) o el numero
                    cantidad_boletos: parseInt(document.getElementById('custom-qty').value),
                    estado: 'pendiente_validacion' // Directo a pendiente porque ya subió el pago
                }
            ])
            .select();

        if (error) throw error;

        console.log("Orden creada exitosamente:", data);
        
        // C. (Opcional) Aquí podríamos "reservar" tickets aleatorios, 
        // pero tu flujo dice que el admin valida primero.
        
        return true; // Todo salió bien

    } catch (err) {
        console.error("Error procesando compra:", err);
        Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo procesar el pedido. Intenta de nuevo.' });
        return false;
    }
}
