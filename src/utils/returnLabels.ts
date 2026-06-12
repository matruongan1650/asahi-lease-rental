export function getReturnRequestLabel(returnRequestType?: string | null): string {
  if (returnRequestType === "full") return "一括返却";
  if (returnRequestType === "partial") return "一部返却";
  return "";
}

export function formatStatusWithReturnRequest(status?: string | null, returnRequestType?: string | null): string {
  const label = getReturnRequestLabel(returnRequestType);
  return [status || "", label].filter(Boolean).join(" ");
}
