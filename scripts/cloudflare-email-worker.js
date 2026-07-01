// ============================================================
// Cloudflare Email Worker — facturas@mystoredigital.cloud
// ============================================================
// SIN dependencias npm (parsea el correo a mano), para que funcione
// pegándolo tal cual en el editor del panel de Cloudflare.
//
// Recibe los correos de facturas (peaje/parqueadero) y notificaciones
// bancarias, saca el cuerpo y los PDF adjuntos, y los reenvía a n8n como
// JSON. n8n extrae el monto con OpenRouter y registra el movimiento.
//
// BLINDAJE: si n8n no responde (caído, workflow desactivado, timeout),
// reintenta y, si aún falla, REENVÍA el correo original al buzón de
// respaldo para que nunca se pierda. Luego se puede re-reenviar/re-inyectar.
//
// Despliegue (panel de Cloudflare):
//   1) Email → Email Routing → Enable (dominio mystoredigital.cloud)
//   2) Email Routing → Email Workers → Create → "Create my own" →
//      borra el ejemplo, pega ESTE archivo → Deploy.
//   3) Email Routing → Routing rules → Custom addresses →
//      facturas@mystoredigital.cloud → Action: "Send to a Worker" → este worker
//   4) El buzón de respaldo (BACKUP) debe estar como "Destination address"
//      verificada en Email Routing, si no message.forward() falla.
// ============================================================

const N8N_WEBHOOK = "https://n8n.mystoredigital.cloud/webhook/factura-correo-7c3f9a2e5b14";
const BACKUP = "yoanyagudelo+respaldoworker@gmail.com";
const MAX_TRIES = 3;

export default {
  async email(message, env, ctx) {
    let payload = null;
    try {
      const raw = await new Response(message.raw).text();
      const topHeaders = raw.slice(0, headerEnd(raw));
      const topCT = message.headers.get("content-type") || header(topHeaders, "content-type") || "";
      const body = splitBody(raw);

      const collected = { text: "", html: "", attachments: [] };
      walk(body, topCT, collected, topHeaders);

      // Fallback: si no hubo texto plano pero sí HTML, deriva texto legible
      // (los correos de Bancolombia vienen como HTML en quoted-printable).
      const text = collected.text.trim() ? collected.text : stripHtml(collected.html);

      payload = {
        subject: message.headers.get("subject") || "",
        from: message.from || "",
        text,
        html: collected.html,
        attachments: collected.attachments,
      };
    } catch (err) {
      console.log("parse error:", err && err.message);
    }

    // Enviar a n8n con reintentos
    let delivered = false;
    if (payload) {
      for (let i = 0; i < MAX_TRIES && !delivered; i++) {
        try {
          const r = await fetch(N8N_WEBHOOK, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (r.ok) delivered = true;
          else console.log("n8n respondió", r.status, "(intento " + (i + 1) + ")");
        } catch (e) {
          console.log("fetch n8n falló:", e && e.message, "(intento " + (i + 1) + ")");
        }
        if (!delivered && i < MAX_TRIES - 1) await sleep(1500 * (i + 1));
      }
    }

    // Si no se pudo entregar, reenviar el original al respaldo (no perderlo)
    if (!delivered) {
      try {
        await message.forward(BACKUP);
        console.log("n8n no disponible → correo reenviado a respaldo", BACKUP);
      } catch (e) {
        console.log("forward a respaldo falló:", e && e.message);
      }
    }
  },
};

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function headerEnd(raw) {
  const i = raw.search(/\r?\n\r?\n/);
  return i === -1 ? raw.length : i;
}

// Devuelve el cuerpo (lo que va después de la 1ª línea en blanco)
function splitBody(raw) {
  const i = raw.search(/\r?\n\r?\n/);
  return i === -1 ? raw : raw.slice(i).replace(/^\r?\n\r?\n/, "");
}

function getBoundary(ct) {
  const m = /boundary="?([^";]+)"?/i.exec(ct || "");
  return m ? m[1] : null;
}

// Recorre un cuerpo según su Content-Type (recursivo para multipart)
function walk(body, contentType, out, topHeaders) {
  const ct = (contentType || "").toLowerCase();
  if (ct.startsWith("multipart/")) {
    const boundary = getBoundary(contentType);
    if (!boundary) return;
    const parts = body.split("--" + boundary);
    for (let seg of parts) {
      seg = seg.replace(/^\r?\n/, "");
      if (!seg || seg.startsWith("--")) continue; // preámbulo / cierre
      const hb = seg.search(/\r?\n\r?\n/);
      if (hb === -1) continue;
      const headers = seg.slice(0, hb);
      const partBody = seg.slice(hb).replace(/^\r?\n\r?\n/, "");
      handlePart(headers, partBody, out);
    }
  } else {
    // hoja suelta sin multipart: usa los headers del tope para leer el
    // content-transfer-encoding (si no, no se decodifica quoted-printable)
    handlePart(topHeaders || "", body, out, contentType);
  }
}

function header(headers, name) {
  // desdobla líneas de continuación (RFC 822 folding) y busca el header
  const lines = (headers || "").replace(/\r?\n[ \t]+/g, " ").split(/\r?\n/);
  name = name.toLowerCase();
  for (const l of lines) {
    const idx = l.indexOf(":");
    if (idx > 0 && l.slice(0, idx).trim().toLowerCase() === name) return l.slice(idx + 1).trim();
  }
  return "";
}

function handlePart(headers, partBody, out, forcedCT) {
  const ct = (forcedCT || header(headers, "content-type") || "text/plain").toLowerCase();
  const cte = (header(headers, "content-transfer-encoding") || "7bit").toLowerCase();
  const cd = header(headers, "content-disposition");

  if (ct.startsWith("multipart/")) {
    walk(partBody, forcedCT || header(headers, "content-type"), out);
    return;
  }

  const isAttachment = /attachment/i.test(cd) || /filename=/i.test(cd) || /name=/i.test(headers);
  const filename = (/(?:filename|name)="?([^"\r\n;]+)"?/i.exec(cd + " " + headers) || [])[1] || "archivo";

  if (!isAttachment && ct.startsWith("text/plain")) {
    out.text += decodeText(partBody, cte) + "\n";
  } else if (!isAttachment && ct.startsWith("text/html")) {
    out.html += decodeText(partBody, cte);
  } else if (isAttachment || ct === "application/pdf" || /image\//.test(ct)) {
    // mantenemos el base64 tal cual para mandarlo a n8n
    const b64 = cte === "base64" ? partBody.replace(/\s+/g, "") : btoa(partBody);
    out.attachments.push({ filename, mimeType: ct.split(";")[0].trim(), contentBase64: b64 });
  }
}

function decodeText(s, cte) {
  try {
    if (cte === "base64") {
      const bin = atob(s.replace(/\s+/g, ""));
      return utf8(bin);
    }
    if (cte === "quoted-printable") {
      const t = s
        .replace(/=\r?\n/g, "")
        .replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
      return utf8(t);
    }
    return s;
  } catch (e) {
    return s;
  }
}

function utf8(bin) {
  try {
    return decodeURIComponent(escape(bin));
  } catch (e) {
    return bin;
  }
}

// HTML → texto legible (quita head/style/script y etiquetas, decodifica entidades)
function stripHtml(h) {
  let t = (h || "")
    .replace(/<head[\s\S]*?<\/head>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  t = t
    .replace(/&nbsp;/gi, " ")
    .replace(/&iexcl;/gi, "¡")
    .replace(/&oacute;/gi, "ó").replace(/&aacute;/gi, "á").replace(/&eacute;/gi, "é")
    .replace(/&iacute;/gi, "í").replace(/&uacute;/gi, "ú").replace(/&ntilde;/gi, "ñ")
    .replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
  return t.replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").replace(/\n{2,}/g, "\n").trim();
}
