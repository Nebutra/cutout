export function commerceRoleLabel(role: string): string {
  if (role === "localized-description:en-US") return "English description";
  if (role === "localized-description:ko-KR") return "Korean description";
  if (role === "localized-description:pt-BR") return "Portuguese description";
  if (role === "main-image") return "Main image";
  if (role.startsWith("detail-image:")) return `Detail image ${role.split(":")[1]}`;
  if (role === "product-video") return "Product video";
  return "Strategy document";
}
