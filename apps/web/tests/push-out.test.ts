import assert from "node:assert/strict";
import { test } from "node:test";
import { Group, Mesh, Vector3 } from "three";
import { bodyMeshes, clearAlongNormal } from "@/lib/push-out";

const GAP = 0.004;

void test("体からの押し出しが斜めなら、長さが足りていても法線の方向の不足分を足す", () => {
  // 脇のように、内側の服の面（法線+X）に対して、体からの押し出しが斜め上を向いている
  const n = new Vector3(1, 0, 0);
  const push = new Vector3(0.002, 0.006, 0);
  clearAlongNormal(push, n, -0.001, GAP);
  assert.ok(Math.abs(push.dot(n) - 0.005) < 1e-9);
  // 面に沿った成分（体からの押し出し）はそのまま残す
  assert.ok(Math.abs(push.y - 0.006) < 1e-9);
});

void test("押し出しの法線の方向の成分で離れていれば、変えない", () => {
  const n = new Vector3(0, 0, 1);
  const push = new Vector3(0, 0.001, 0.005);
  clearAlongNormal(push, n, 0, GAP);
  assert.deepEqual(push.toArray(), [0, 0.001, 0.005]);
});

void test("押し出しが無ければ、面からgapの所まで法線の方向へ出す", () => {
  const n = new Vector3(0, 1, 0);
  const push = new Vector3();
  clearAlongNormal(push, n, 0.001, GAP);
  assert.ok(Math.abs(push.y - 0.003) < 1e-9);
  assert.equal(push.x, 0);
});

void test("体のglbに着せるための体（avatar_fit）があれば、それを押し出しの相手にして、描かない", () => {
  const root = new Group();
  const fit = new Mesh();
  fit.name = "avatar_fit";
  const body = new Mesh();
  body.name = "avatar";
  // Blenderの書き出しでは、着せるための体が先に並ぶ
  root.add(fit, body);
  assert.deepEqual(bodyMeshes(root), { body, collider: fit });
  // 着せるための体は描かない
  assert.equal(fit.visible, false);
  assert.equal(body.visible, true);
});

void test("着せるための体が無ければ（男性）、描く体に対して押し出す", () => {
  const root = new Group();
  const body = new Mesh();
  root.add(body);
  assert.deepEqual(bodyMeshes(root), { body, collider: body });
});
