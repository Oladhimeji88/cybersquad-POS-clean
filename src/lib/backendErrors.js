function collectFieldMessages(fields) {
  if (!fields || typeof fields !== "object") return [];

  return Object.values(fields).flatMap((value) => {
    if (Array.isArray(value)) {
      return value.map((entry) => String(entry).trim()).filter(Boolean);
    }

    if (value == null) return [];
    return [String(value).trim()].filter(Boolean);
  });
}

export function extractBackendErrorMessage(payload, fallback = "Something went wrong.") {
  if (!payload) return fallback;

  if (typeof payload === "string") {
    const message = payload.trim();
    return message || fallback;
  }

  const errorPayload =
    payload && typeof payload === "object" && payload.error && typeof payload.error === "object"
      ? payload.error
      : payload;

  const fieldMessages = collectFieldMessages(errorPayload?.fields);
  if (fieldMessages.length > 0) {
    return fieldMessages.join(" ");
  }

  if (typeof errorPayload?.message === "string" && errorPayload.message.trim()) {
    return errorPayload.message.trim();
  }

  if (typeof payload?.message === "string" && payload.message.trim()) {
    return payload.message.trim();
  }

  return fallback;
}
