"use client";

export default function LogoutButton() {
  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/";
  }

  return (
    <button
      onClick={handleLogout}
      className="cursor-pointer rounded-lg px-2 py-2 min-h-[44px] hover:text-ink active:bg-ink/5"
    >
      Log out
    </button>
  );
}
