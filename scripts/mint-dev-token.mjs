// Mints a wall-shaped session JWT with a realm's HS256 secret so the API can be
// exercised locally without a real wall login. Dev only — it needs the secret.
//   npm run dev:token -- [realm] [sub] [email]
import { SignJWT } from "jose";
import { config } from "../api/config.mjs";

const [realmId = process.env.DEV_REALM || config.realms[0].id, sub = "00000000-0000-4000-8000-000000000001", email = "dev@example.edu"] = process.argv.slice(2);
const realm = config.realms.find((r) => r.id === realmId);
if (!realm?.secret) {
  console.error(`realm ${realmId} has no HS256 secret configured`);
  process.exit(1);
}
const token = await new SignJWT({ role: "authenticated", email, user_metadata: { display_name: "Dev User" } })
  .setProtectedHeader({ alg: "HS256" })
  .setIssuer(realm.issuers[0])
  .setSubject(sub)
  .setAudience("authenticated")
  .setIssuedAt()
  .setExpirationTime("2h")
  .sign(new TextEncoder().encode(realm.secret));
console.log(token);
