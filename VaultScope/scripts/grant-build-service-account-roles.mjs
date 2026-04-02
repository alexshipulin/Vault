#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const projectId = process.argv[2] ?? "vault-93a7b";
const projectNumber = process.argv[3] ?? "401718101369";
const buildServiceAccount = `${projectNumber}-compute@developer.gserviceaccount.com`;
const member = `serviceAccount:${buildServiceAccount}`;

const roles = [
  "roles/cloudbuild.builds.builder",
  "roles/artifactregistry.writer",
  "roles/storage.objectViewer",
  "roles/logging.logWriter",
];

async function readFirebaseAccessToken() {
  const configPath = path.join(
    os.homedir(),
    ".config",
    "configstore",
    "firebase-tools.json",
  );
  const raw = await readFile(configPath, "utf8");
  const parsed = JSON.parse(raw);
  const token = parsed?.tokens?.access_token;

  if (!token) {
    throw new Error(`No firebase access token found in ${configPath}`);
  }

  return token;
}

async function apiRequest(url, token, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${JSON.stringify(body)}`);
  }

  return body;
}

function ensureBinding(bindings, role, memberValue) {
  const existing = bindings.find((binding) => binding.role === role);
  if (existing) {
    existing.members = Array.from(new Set([...(existing.members ?? []), memberValue]));
    return bindings;
  }

  return [...bindings, { role, members: [memberValue] }];
}

async function main() {
  const token = await readFirebaseAccessToken();
  const policyUrl = `https://cloudresourcemanager.googleapis.com/v1/projects/${projectId}:getIamPolicy`;
  const setPolicyUrl = `https://cloudresourcemanager.googleapis.com/v1/projects/${projectId}:setIamPolicy`;

  const current = await apiRequest(policyUrl, token, {
    method: "POST",
    body: JSON.stringify({}),
  });

  const updatedBindings = roles.reduce(
    (bindings, role) => ensureBinding(bindings, role, member),
    current.bindings ?? [],
  );

  const nextPolicy = {
    ...current,
    bindings: updatedBindings,
  };

  await apiRequest(setPolicyUrl, token, {
    method: "POST",
    body: JSON.stringify({
      policy: nextPolicy,
      updateMask: "bindings,etag,auditConfigs",
    }),
  });

  console.log(`Granted build roles to ${buildServiceAccount} in ${projectId}`);
  for (const role of roles) {
    console.log(`- ${role}`);
  }
}

main().catch((error) => {
  console.error("Failed to grant build service account roles:", error);
  process.exit(1);
});
