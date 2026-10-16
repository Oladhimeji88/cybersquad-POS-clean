import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

const bundled = await build({ entryPoints: ["src/auth/roleUtils.ts"], bundle: true, write: false, format: "esm", platform: "node" });
const roles = await import("data:text/javascript;base64," + Buffer.from(bundled.outputFiles[0].text).toString("base64"));
const payload = (...names) => ({ roles: names.map((name) => ({ name })) });

test("a user can hold several roles and keeps the main one for landing and repair screens", () => {
  assert.deepEqual(roles.resolveAppRolesFromAuthPayload(payload("Front Desk", "Sales")), ["front_desk", "sales"]);
  assert.equal(roles.resolveAppRoleFromAuthPayload(payload("Front Desk", "Sales")), "front_desk");
  assert.equal(roles.resolveAppRoleFromAuthPayload(payload("Sales", "Front Desk")), "front_desk");
  assert.equal(roles.resolveAppRoleFromAuthPayload(payload("Cashier")), "sales");
  assert.deepEqual(roles.resolveAppRolesFromAuthPayload(payload("Sales", "cashier")), ["sales"]);
});

test("role checks look at every held role, not only the main one", () => {
  const user = { role: "front_desk", roles: ["front_desk", "sales"] };
  assert.equal(roles.userHasRole(user, "sales", "admin"), true);
  assert.equal(roles.userHasRole(user, "qa"), false);
  assert.equal(roles.userHasRole({ role: "qa" }, "qa"), true);
  assert.equal(roles.userHasRole(null, "qa"), false);
});

test("accounts with no recognised role fall back to admin only for superusers", () => {
  assert.deepEqual(roles.resolveAppRolesFromAuthPayload({ user: { is_superuser: true } }), ["admin"]);
  assert.deepEqual(roles.resolveAppRolesFromAuthPayload({ user: {} }), []);
  assert.equal(roles.resolveAppRoleFromAuthPayload({ user: {} }), null);
});

test("a salesperson is never promoted to admin by looser payload fields", () => {
  assert.equal(roles.resolveAppRoleFromAuthPayload({ ...payload("Sales"), admin_roles: ["admin"], user: { role: "admin", is_staff: true } }), "sales");
  assert.equal(roles.resolveAppRoleFromAuthPayload(payload("Sales Administrator")), "sales");
  assert.equal(roles.resolveAppRoleFromAuthPayload({ admin_roles: ["Super Admin"] }), "admin");
});

test("handoff roles resolve from their business names and land on operations", () => {
  assert.equal(roles.resolveAppRoleFromAuthPayload(payload("Procurement")), "procurement");
  assert.equal(roles.resolveAppRoleFromAuthPayload(payload("Logistics Coordinator")), "logistics");
  assert.equal(roles.resolveAppRoleFromAuthPayload(payload("Customer Experience")), "cx");
  assert.equal(roles.resolveAppRoleFromAuthPayload(payload("Finance")), "finance");
  assert.equal(roles.resolveAppRoleFromAuthPayload(payload("Operations Manager")), "operations");
  assert.equal(roles.resolveAppRoleFromAuthPayload(payload("Management")), "admin");
  assert.equal(roles.resolveAppRoleFromAuthPayload(payload("Sales Administrator")), "sales");
  assert.equal(roles.getLandingPath("procurement"), "/operations");
});
