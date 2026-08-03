"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { signIn } from "@/server/auth/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    setError(null);
    setLoading(true);
    const response = await signIn.email({ email, password });
    setLoading(false);

    if (response.error) {
      setError("E-mail ou senha inválidos.");
      return;
    }

    router.replace("/dashboard/scorecard");
    router.refresh();
  }

  return (
    <div className="login-page">
      <Image
        src="/brand/usina.jpg"
        alt=""
        fill
        priority
        className="login-background"
        sizes="100vw"
      />

      <form className="login-card" onSubmit={handleSubmit}>
        <Image
          src="/brand/logo-inpasa.png"
          alt="Inpasa"
          width={180}
          height={54}
          priority
          className="login-logo"
        />
        <h1>Central de Indicadores</h1>
        <p>Acesse com suas credenciais.</p>

        <div className="login-field">
          <label htmlFor="email">E-mail</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />
        </div>

        <div className="login-field">
          <label htmlFor="password">Senha</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </div>

        {error ? <p className="login-error">{error}</p> : null}

        <button className="btn login-submit" type="submit" disabled={loading}>
          {loading ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}
