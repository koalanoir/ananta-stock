"use client";

import {
  Eye,
  EyeOff,
  LoaderCircle,
  Plus,
  X,
} from "lucide-react";
import {
  FormEvent,
  useState,
} from "react";

type Seller = {
  id: string;
  name: string;
  username: string;
  status: "En poste" | "Hors ligne";
  hours: string;
  hoursWorked: number;
  sales: number;
  unitsSold: number;
};

type CreateSellerModalProps = {
  storeId: string;
  storeName: string;
  onClose: () => void;
  onCreated: (seller: Seller) => void;
};

export function CreateSellerModal({
  storeId,
  storeName,
  onClose,
  onCreated,
}: CreateSellerModalProps) {
  const [fullName, setFullName] =
    useState("");

  const [username, setUsername] =
    useState("");

  const [pin, setPin] = useState("");
  const [showPin, setShowPin] =
    useState(false);

  const [pending, setPending] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState("");

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!/^\d{6}$/.test(pin)) {
      setErrorMessage(
        "Le code PIN doit contenir exactement 6 chiffres.",
      );
      return;
    }

    setPending(true);
    setErrorMessage("");

    const response = await fetch(
      "/api/admin/sellers",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          storeId,
          fullName,
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
        "Le vendeur n’a pas pu être créé.",
      );
      return;
    }

    onCreated(result.seller);
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-seller-title"
      className="fixed inset-0 z-50 grid place-items-center bg-sidebar/55 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-2xl sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              id="create-seller-title"
              className="text-xl font-semibold"
            >
              Créer un vendeur
            </h2>

            <p className="mt-1 text-sm text-foreground/50">
              Le vendeur sera associé à {storeName}.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="grid h-9 w-9 place-items-center rounded-lg hover:bg-surface-muted"
          >
            <X size={18} />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="mt-6 space-y-4"
        >
          <div>
            <label
              htmlFor="seller-name"
              className="text-sm font-semibold"
            >
              Nom complet
            </label>

            <input
              id="seller-name"
              type="text"
              required
              autoFocus
              value={fullName}
              onChange={(event) =>
                setFullName(event.target.value)
              }
              placeholder="Aïcha Mbemba"
              className={inputClass}
            />
          </div>

          <div>
            <label
              htmlFor="seller-username"
              className="text-sm font-semibold"
            >
              Nom d’utilisateur
            </label>

            <input
              id="seller-username"
              type="text"
              required
              minLength={3}
              maxLength={30}
              autoComplete="off"
              value={username}
              onChange={(event) =>
                setUsername(
                  event.target.value
                    .toLowerCase()
                    .replace(
                      /[^a-z0-9._-]/g,
                      "",
                    ),
                )
              }
              placeholder="aicha"
              className={inputClass}
            />

            <p className="mt-1.5 text-xs text-foreground/45">
              Lettres minuscules, chiffres, point,
              tiret ou underscore.
            </p>
          </div>

          <div>
            <label
              htmlFor="seller-pin"
              className="text-sm font-semibold"
            >
              Code PIN temporaire
            </label>

            <div className="relative mt-2">
              <input
                id="seller-pin"
                type={
                  showPin ? "text" : "password"
                }
                required
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                autoComplete="new-password"
                value={pin}
                onChange={(event) =>
                  setPin(
                    event.target.value.replace(
                      /\D/g,
                      "",
                    ),
                  )
                }
                placeholder="6 chiffres"
                className="h-12 w-full rounded-xl border border-border bg-background px-4 pr-12 font-mono tracking-[0.25em] outline-none focus:border-brand focus:ring-3 focus:ring-brand/10"
              />

              <button
                type="button"
                onClick={() =>
                  setShowPin(
                    (current) => !current,
                  )
                }
                aria-label={
                  showPin
                    ? "Masquer le PIN"
                    : "Afficher le PIN"
                }
                className="absolute right-4 top-1/2 -translate-y-1/2 text-foreground/40"
              >
                {showPin ? (
                  <EyeOff size={18} />
                ) : (
                  <Eye size={18} />
                )}
              </button>
            </div>
          </div>

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
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-50"
          >
            {pending ? (
              <>
                <LoaderCircle
                  className="animate-spin"
                  size={17}
                />
                Création…
              </>
            ) : (
              <>
                <Plus size={17} />
                Créer le vendeur
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

const inputClass =
  "mt-2 h-12 w-full rounded-xl border border-border bg-background px-4 outline-none focus:border-brand focus:ring-3 focus:ring-brand/10";