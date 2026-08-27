/**
 * Protege todo el sitio con HTTP Basic Auth (el popup nativo de usuario y
 * contraseña del navegador). Corre en cada request, antes de servir
 * cualquier archivo -- no requiere backend propio, funciona en el plan
 * gratuito de Netlify (Edge Functions).
 *
 * El usuario y la contraseña NO van en este archivo: se configuran como
 * variables de entorno en Netlify (Site settings -> Environment variables):
 *   BASIC_AUTH_USER
 *   BASIC_AUTH_PASS
 *
 * Importante: esto protege el ACCESO al dashboard (la UI), no los datos.
 * La hoja de Google Sheets se sigue leyendo con un fetch directo del
 * navegador a una URL pública -- Basic Auth no la oculta. Si en algún
 * momento se migra la fuente de datos a un bucket privado con URLs
 * firmadas, ese sí sería el paso que protege los datos en sí.
 */

export default async (request, context) => {
    // .trim() por si el valor quedó con un espacio o salto de línea pegado
    // al copiarlo en el panel de Netlify -- causa muy común de que
    // credenciales "correctas" no coincidan.
    const expectedUser = Netlify.env.get("BASIC_AUTH_USER")?.trim();
    const expectedPass = Netlify.env.get("BASIC_AUTH_PASS")?.trim();

    // Sin credenciales configuradas en Netlify, no hay nada contra qué
    // validar: se bloquea todo (fail-closed) en vez de dejar el sitio
    // abierto por un olvido de configuración.
    if (!expectedUser || !expectedPass) {
        return new Response(
            "Autenticación no configurada. Definí BASIC_AUTH_USER y BASIC_AUTH_PASS en las variables de entorno de Netlify.",
            {
                status: 401,
                headers: { "WWW-Authenticate": 'Basic realm="Dashboard MKT"' },
            }
        );
    }

    const authHeader = request.headers.get("authorization") || "";
    const [scheme, encoded] = authHeader.split(" ");

    if (scheme === "Basic" && encoded) {
        let decoded = "";
        try {
            decoded = atob(encoded);
        } catch {
            decoded = "";
        }

        const separatorIndex = decoded.indexOf(":");
        const user = separatorIndex >= 0 ? decoded.slice(0, separatorIndex) : decoded;
        const pass = separatorIndex >= 0 ? decoded.slice(separatorIndex + 1) : "";

        if (user === expectedUser && pass === expectedPass) {
            return context.next();
        }
    }

    return new Response("Acceso restringido.", {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="Dashboard MKT"' },
    });
};

export const config = { path: "/*" };
