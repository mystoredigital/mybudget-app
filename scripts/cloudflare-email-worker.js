// ============================================================
// Cloudflare Email Worker — facturas@mystoredigital.cloud
// ============================================================
// SIN dependencias npm (parsea el correo a mano), para que funcione
// pegándolo tal cual en el editor del panel de Cloudflare.
//
// Recibe los correos de facturas (peaje/parqueadero), saca el cuerpo y
// los PDF adjuntos, y los reenvía a n8n como JSON. n8n extrae el monto
// con OpenRouter, registra el gasto Pagado en Bancolombia y guarda el PDF.
//
// Despliegue (panel de Cloudflare):
//   1) Email → Email Routing → Enable (dominio mystoredigital.cloud)
//   2) Email Routing → Email Workers → Create → "Create my own" →
//      borra el ejemplo, pega ESTE archivo → Deploy.
//   3) Email Routing → Routing rules → Custom addresses →
//      facturas@mystoredigital.cloud → Action: "Send to a Worker" → este worker
//   4) Reenvía (o crea una regla automática) las facturas a esa dirección.
// ============================================================

const N8N_WEBHOOK = "https://n8n.mystoredigital.cloud/webhook/factura-correo-7c3f9a2e5b14";

export default {
  async email(message, env, ctx) {
    try {
      const raw = await new Response(message.raw).text();
      const topCT = message.headers.get("content-type") || "";
      const body = splitBody(raw);

      const collected = { text: "", html: "", attachments: [] };
      walk(body, topCT, collected);

      const payload = {
        subject: message.headers.get("subject") || "",
        from: message.from || "",
        text: collected.text,
        html: collected.html,
        attachments: collected.attachments,
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
function walk(body, contentType, out) {
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
    // hoja suelta sin multipart
    handlePart("", body, out, contentType);
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
