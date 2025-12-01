// client_logic.js - Lógica de compra y ASIGNACIÓN DE BOLETOS

// ⚠️ TUS CLAVES DE SUPABASE
const SUPABASE_URL = 'https://tpzuvrvjtxuvmyusjmpq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRwenV2cnZqdHh1dm15dXNqbXBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1NDMwMDAsImV4cCI6MjA4MDExOTAwMH0.YcGZLy7W92H0o0TN4E_v-2PUDtcSXhB-D7x7ob6TTp4';

const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

// Variables
let compraActual = { cantidad: 1, monto: 700 };

function actualizarDatosCompra(qty, total) {
    compraActual.cantidad = qty;
    compraActual.monto = total;
}

// Subir Foto
async function subirComprobante(file) {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}.${fileExt}`;
    const { data, error } = await supabaseClient.storage.from('comprobantes').upload(fileName, file);
    if (error) throw error;
    const { data: { publicUrl } } = supabaseClient.storage.from('comprobantes').getPublicUrl(fileName);
    return publicUrl;
}

// PROCESO FINAL
async function procesarCompraFinal() {
    const nombre = document.getElementById('input-name').value;
    const cedula = document.getElementById('input-cedula').value;
    const telefono = document.getElementById('input-country-code').value + document.getElementById('input-phone').value;
    const email = document.getElementById('input-email').value;
    const referencia = document.getElementById('input-referencia').value;
    const fileInput = document.getElementById('input-comprobante');
    const cantidad = parseInt(document.getElementById('custom-qty').value);
    
    // Limpieza de Monto
    let montoTexto = document.getElementById('step4-total').innerText;
    let montoFinal = parseFloat(montoTexto.replace('Bs.', '').replace(/\./g, '').replace(',', '.').trim());

    if (!fileInput.files.length) { alert("Falta el comprobante"); return false; }

    try {
        // 1. Subir Imagen
        const urlImagen = await subirComprobante(fileInput.files[0]);

        // 2. Crear Orden
        const { data: ordenData, error: ordenError } = await supabaseClient
            .from('ordenes')
            .insert([{
                nombre: nombre,
                cedula: cedula,
                telefono: telefono,
                email: email,
                metodo_pago: 'pago_movil',
                referencia_pago: referencia,
                url_comprobante: urlImagen,
                monto_total: montoFinal,
                cantidad_boletos: cantidad,
                estado: 'pendiente_validacion'
            }])
            .select()
            .single();

        if (ordenError) throw ordenError;
        const ordenId = ordenData.id;

        // 3. ASIGNAR BOLETOS AUTOMÁTICAMENTE
        // Buscamos tickets disponibles
        const { data: ticketsLibres, error: ticketsError } = await supabaseClient
            .from('tickets')
            .select('id, numero')
            .eq('estado', 'disponible')
            .limit(cantidad);

        if (ticketsError || !ticketsLibres || ticketsLibres.length < cantidad) {
            console.error("No hay suficientes tickets disponibles");
            // Aquí podríamos revertir la orden, pero por ahora seguimos
        } else {
            // Extraemos los IDs de los tickets que vamos a tomar
            const idsTickets = ticketsLibres.map(t => t.id);
            const numerosAsignados = ticketsLibres.map(t => t.numero);

            // Actualizamos esos tickets: Los ponemos en 'pendiente' y le ponemos el ID de la orden
            const { error: updateError } = await supabaseClient
                .from('tickets')
                .update({ 
                    estado: 'pendiente', 
                    id_orden: ordenId 
                })
                .in('id', idsTickets);

            if (updateError) throw updateError;

            // Retornamos los números para mostrarlos en el index
            return numerosAsignados; 
        }

        return []; // Si falló la asignación retorna vacío pero la orden se creó

    } catch (err) {
        console.error("Error crítico:", err);
        Swal.fire({ icon: 'error', title: 'Error', text: 'Hubo un problema. Intenta de nuevo.' });
        return false;
    }
}
