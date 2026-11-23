import { authService } from "../services/authService.js";
import { DEFAULT_API_KEY, DEFAULT_BASE_URL, getApiKey, getBaseUrl } from "../api/httpClient.js";

document.addEventListener('DOMContentLoaded', async () => {
    // Si ya hay sesión activa válida, redirigir a productos
    const usuario = await authService.checkSession();
    if (usuario && usuario.autenticado) {
        window.location.href = './productos.html';
        return;
    }

    const form = document.getElementById('formLogin');
    const txtApiKey = document.getElementById('txtApiKey');
    const txtApiUrl = document.getElementById('txtApiUrl');
    const btnLogin = document.getElementById('btnLogin');
    const alertError = document.getElementById('alertError');

    // Cargar valores previos si existen en localStorage
    txtApiKey.value = getApiKey() || DEFAULT_API_KEY;
    txtApiUrl.value = getBaseUrl() || DEFAULT_BASE_URL;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        alertError.classList.add('d-none');
        alertError.textContent = '';

        const apiKey = txtApiKey.value.trim();
        const apiUrl = txtApiUrl.value.trim();

        if (!apiKey) {
            alertError.textContent = 'Por favor ingresa una API Key.';
            alertError.classList.remove('d-none');
            return;
        }

        // Control de un solo click y notificación de proceso en curso
        btnLogin.disabled = true;
        btnLogin.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Validando credenciales...';

        try {
            await authService.login(apiKey, apiUrl);
            window.location.href = './productos.html';
        } catch (error) {
            alertError.textContent = error.message || 'No se pudo conectar con la API. Verifica que esté en ejecución en ' + apiUrl;
            alertError.classList.remove('d-none');
        } finally {
            // Se reactiva el botón al recibir respuesta (sea exitosa o fallida)
            btnLogin.disabled = false;
            btnLogin.textContent = 'Ingresar al Sistema';
        }
    });
});
