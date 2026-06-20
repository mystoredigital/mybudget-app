// ============================================================
// Cloudflare Email Worker — facturas@mystoredigital.cloud
// ============================================================
// Recibe los correos de facturas (peaje/parqueadero), los parsea y
// reenvía a n8n como JSON. n8n extrae el monto con OpenRouter,
// registra el gasto Pagado en Bancolombia y guarda el PDF.
//
// Despliegue (panel de Cloudflare):
//   1) Email → Email Routing → Enable (en el dominio mystoredigital.cloud)
//   2) Workers & Pages → Create → Worker → nombre "factura-email" →
//      pega este archivo → Deploy.  (el editor bundlea el npm postal-mime)
//   3) Email Routing → Routing rules → Custom addresses →
//      facturas@mystoredigital.cloud → Action: "Send to a Worker" → factura-email
//   4) Reenvía (o crea una regla automática) las facturas a esa dirección.
// ============================================================

import PostalMime from "postal-mime";

const N8N_WEBHOOK = "https://n8n.mystoredigital.cloud/webhook/factura-correo-7c3f9a2e5b14";

export default {
  async email(message, env, ctx) {
    try {
      const raw = await new Response(message.raw).arrayBuffer();
      const email = await new PostalMime().parse(raw);

      const attachments = (email.attachments || []).map((a) => ({
        filename: a.filename || "archivo",
        mimeType: a.mimeType || "application/octet-stream",
        contentBase64: toBase64(a.content),
      }));

      const payload = {
        subject: email.subject || "",
        from: message.from || (email.from && email.from.address) || "",
        text: email.text || "",
        html: email.html || "",
        attachments,
      };

      await fetch(N8N_WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      console.log("email worker error:", err && err.message);
    }
  },
};

function toBase64(content) {
  if (content == null) return "";
  if (typeof content === "string") return btoa(unescape(encodeURIComponent(content)));
  const bytes = content instanceof Uint8Array ? content : new Uint8Array(content);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
