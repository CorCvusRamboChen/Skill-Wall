// Runtime config, all from the environment. Fails fast on the pieces the API
// cannot run without, so a bad deploy dies at boot instead of at first request.

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`missing env ${name}`);
  return v;
}

function parseRealms(raw) {
  let list;
  try {
    list = JSON.parse(raw);
  } catch (e) {
    throw new Error(`REALMS is not valid JSON: ${e.message}`);
  }
  if (!Array.isArray(list) || !list.length) throw new Error("REALMS must be a non-empty array");
  return list.map((r) => {
    if (!r.id) throw new Error("realm without id");
    const issuers = r.issuers || (r.issuer ? [r.issuer] : []);
    if (!issuers.length) throw new Error(`realm ${r.id} has no issuers`);
    if (!r.secret && !r.jwksUrl) throw new Error(`realm ${r.id} needs secret or jwksUrl`);
    return {
      id: r.id,
      issuers: issuers.map((s) => s.replace(/\/+$/, "")),
      secret: r.secret || null,
      jwksUrl: r.jwksUrl || null,
      schools: Array.isArray(r.schools) ? r.schools : [r.id]
    };
  });
}

export const config = {
  port: Number(process.env.PORT || 8787),
  databaseUrl: required("DATABASE_URL"),
  corsOrigins: (process.env.CORS_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean),
  realms: parseRealms(required("REALMS"))
};

export function realmByIssuer(iss) {
  const clean = String(iss || "").replace(/\/+$/, "");
  return config.realms.find((r) => r.issuers.includes(clean)) || null;
}
