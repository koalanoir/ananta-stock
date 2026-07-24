"use client";

import {
  LoaderCircle,
  LockKeyhole,
  Store,
  UserRound,
} from "lucide-react";
import {
  FormEvent,
  useState,
} from "react";
import { useRouter } from "next/navigation";

export function SellerLoginForm() {
  const router = useRouter();

  const [storeCode, setStoreCode] =
    useState("");

  const [username, setUsername] =
    useState("");

  const [pin, setPin] = useState("");
  const [pending, setPending] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState("");

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setPending(true);
    setErrorMessage("");

    const response = await fetch(
      "/api/auth/seller-login",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          storeCode,
          username,
          pin,
        }),
      },
    );

    const result = await response.json();

    setPending(false);

    if (!response.ok) {
      setErrorMessage(
        result.error ??
        "La connexion a échoué.",
      );
      return;
    }

    router.replace(
      result.destination ?? "/sales",
    );

    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-5"
    >
      <Field
        id="store-code"
        label="Code boutique"
        icon={<Store size={18} />}
      >
        <input
          id="store-code"
          type="text"
          required
          autoComplete="off"
          value={storeCode}
          onChange={(event) =>
            setStoreCode(
              event.target.value.toUpperCase(),
            )
          }
          placeholder="A71C9F20"
          className={inputClass}
        />
      </Field>

      <Field
        id="seller-username"
        label="Nom d’utilisateur"
        icon={<UserRound size={18} />}
      >
        <input
          id="seller-username"
          type="text"
          required
          autoComplete="username"
          value={username}
          onChange={(event) =>
            setUsername(
              event.target.value.toLowerCase(),
            )
          }
          placeholder="aicha"
          className={inputClass}
        />
      </Field>

      <Field
        id="seller-pin"
        label="Code PIN"
        icon={<LockKeyhole size={18} />}
      >
        <input
          id="seller-pin"
          type="password"
          required
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength={6}
          autoComplete="current-password"
          value={pin}
          onChange={(event) =>
            setPin(
              event.target.value.replace(
                /\D/g,
                "",
              ),
            )
          }
          placeholder="••••••"
          className={inputClass}
        />
      </Field>

      {errorMessage ? (
        <div
          role="alert"
          className="rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger"
        >
          {errorMessage}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-50"
      >
        {pending ? (
          <>
            <LoaderCircle
              className="animate-spin"
              size={18}
            />
            Connexion…
          </>
        ) : (
          "Accéder aux ventes"
        )}
      </button>
    </form>
  );
}

const inputClass =
  "h-12 w-full rounded-xl border border-border bg-surface pl-11 pr-4 text-sm outline-none focus:border-brand focus:ring-3 focus:ring-brand/10";

function Field({
  id,
  label,
  icon,
  children,
}: {
  id: string;
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="text-sm font-semibold"
      >
        {label}
      </label>

      <div className="relative mt-2">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-foreground/35">
          {icon}
        </span>

        {children}
      </div>
    </div>
  );
}