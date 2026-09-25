"use client";
import { useRouter } from "next/navigation";
import { LandingNav } from "@/components/layout/LandingNav";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { APP_MODE } from "@/config/app";
import { useAyni } from "@/store/ayni";

const STEPS: [string, string][] = [
  ["Crear grupo", "Monto, fecha y participantes"],
  ["Depositar", "Cada miembro paga su cuota"],
  ["Custodiar", "Fondos bloqueados en Stellar"],
  ["Monitorear", "El agente recuerda a quien falta"],
  ["Evaluar", "¿Se cumplió la fecha o la meta?"],
  ["Disponer", "El tesorero recolecta o entrega"],
  ["Cerrar", "Reporte público del ciclo"],
];

/** Mosaico decorativo (4 filas: 1, 3, 5 y 7 celdas). */
function Pattern() {
  const rects: { x: number; y: number; cls: string }[] = [];
  [1, 3, 5, 7].forEach((n, row) => {
    const off = (7 - n) / 2;
    for (let i = 0; i < n; i++) {
      const c = off + i;
      rects.push({ x: c * 32, y: row * 32, cls: c === 3 ? "t2" : row === 3 && (i === 0 || i === n - 1) ? "t3" : "t1" });
    }
  });
  return (
    <svg className="pat" width="220" height="124" viewBox="0 0 220 124" aria-hidden="true">
      {rects.map((r, i) => (
        <rect key={i} className={r.cls} x={r.x} y={r.y} width="28" height="28" rx="6" />
      ))}
    </svg>
  );
}

export function Landing() {
  const router = useRouter();
  const me = useAyni((s) => s.s.me);
  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  const create = () => router.push(me ? "/groups/new" : "/login?next=/groups/new");

  return (
    <>
      <LandingNav />
      <main id="landing">
        <div className="wrap">
          <section className="hero">
            <div>
              <Pattern />
              <h1>Tu grupo, sin tesorero</h1>
              <p className="lede">
                Las cuotas de tu junta vecinal, tu promoción o tu pandero van a una bóveda que nadie puede tocar, ni siquiera quien creó el
                grupo. Ayni cobra, custodia y paga solo cuando llega la fecha acordada.
              </p>
              <div className="row">
                <button className="btn btn-primary" id="hero-create" onClick={create}>Crear un grupo</button>
                <button className="btn btn-secondary" onClick={() => jump("como")}>Ver cómo funciona</button>
              </div>
            </div>
            <div>
              <Badge tone="neutral" className="example-tag">Ejemplo</Badge>
              <article className="vault" aria-label="Bóveda de ejemplo">
                <div className="vault-top">
                  <p className="vault-name">Vigilancia · Jr. Los Olivos, SMP</p>
                  <Badge tone="locked" icon="lock">Bloqueado</Badge>
                </div>
                <p className="vault-amount">2,300 XLM</p>
                <p className="caption">de 3,000 XLM · 50 XLM por casa × 60 casas</p>
                <div className="progress" aria-hidden="true"><span style={{ width: "77%" }} /></div>
                <div className="vault-meta"><span>46 de 60 casas pagaron</span><span>77%</span></div>
                <div className="release"><Icon name="out" /><span>Cierra el 30 de octubre; luego el tesorero dispone del fondo</span></div>
              </article>
            </div>
          </section>
        </div>

        <section className="block" id="como">
          <div className="wrap">
            <div className="sec-head">
              <p className="eyebrow">Cómo funciona</p>
              <h2>Siete pasos, y ninguno depende de la confianza en una persona</h2>
              <p>El ciclo completo de un fondo grupal, desde que se crea hasta que el dinero llega a su destino y todos pueden verificarlo.</p>
            </div>
            <ol className="steps">
              {STEPS.map((s, i) => (
                <li key={s[0]}>
                  <span className="n">{i + 1}</span>
                  <b>{s[0]}</b>
                  <small>{s[1]}</small>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="block">
          <div className="wrap">
            <div className="sec-head">
              <p className="eyebrow">Para quién</p>
              <h2>Grupos que ya se organizan solos, sin productos bancarios</h2>
            </div>
            <div className="cases">
              <article className="case">
                <span className="glyph"><Icon name="home" /></span>
                <h3>Juntas Vecinales</h3>
                <p className="muted">La cuota para el vigilante o el portón. Nadie cobra casa por casa: el recordatorio lo manda el agente y el tesorero dispone del fondo al cierre.</p>
                <p className="amt">50 XLM × 60 casas → tesorero</p>
              </article>
              <article className="case">
                <span className="glyph"><Icon name="cap" /></span>
                <h3>Comités Escolares</h3>
                <p className="muted">El fondo de la promoción o de la APAFA, bloqueado hasta la fecha de cierre acordada.</p>
                <p className="amt">300 XLM × 32 familias → tesorero</p>
              </article>
              <article className="case">
                <span className="glyph"><Icon name="users" /></span>
                <h3>Panderos</h3>
                <p className="muted">Cada mes, el pozo se abona automáticamente al participante del turno. Sin “ya te pago la próxima”.</p>
                <p className="amt">400 XLM × 10 personas → abono mensual</p>
              </article>
            </div>
          </div>
        </section>

        <section className="block">
          <div className="wrap trust">
            <div className="sec-head">
              <p className="eyebrow">Por qué confiar</p>
              <h2>Nadie puede retirar el dinero antes del cierre</h2>
              <p>La bóveda es un contrato en la red Stellar con reglas fijas: monto y fecha de cierre. Antes de eso no existe un botón de retiro, ni siquiera para el tesorero.</p>
            </div>
            <ul className="checks">
              <li><span className="c"><Icon name="lock" /></span><div><b>Fondos inmovilizados</b><span className="muted">Las cuotas quedan bloqueadas en la bóveda desde el primer sol.</span></div></li>
              <li><span className="c"><Icon name="eye" /></span><div><b>Registro público</b><span className="muted">Cada pago tiene un código verificable que cualquier miembro puede revisar.</span></div></li>
              <li><span className="c"><Icon name="bell" /></span><div><b>El agente cobra, no el vecino</b><span className="muted">Un agente de IA manda recordatorios amables a quien le falta pagar.</span></div></li>
              <li><span className="c"><Icon name="out" /></span><div><b>Cierre con reglas</b><span className="muted">Al cumplirse la fecha o la meta, el tesorero recolecta el fondo o lo entrega a un participante, y queda registrado.</span></div></li>
            </ul>
          </div>
        </section>

        <section className="block" id="wallets">
          <div className="wrap">
            <div className="sec-head">
              <p className="eyebrow">Pagos y wallets</p>
              <h2>Todo en Stellar Lumens (XLM)</h2>
              <p>Cuotas, aportes, pozos y devoluciones se mueven en XLM. Tu cuenta Ayni se protege con huella o Face ID (passkey) y se recarga desde Freighter, Cavos o Privy.</p>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Wallet</th><th>Tipo</th><th>Uso en Ayni</th></tr></thead>
                <tbody>
                  <tr><td><b>Cuenta Ayni (passkey)</b></td><td>Cuenta programable en Stellar (Soroban), firma con huella</td><td>Donde vive tu saldo en XLM; pagas cuotas y recibes pozos y devoluciones.</td></tr>
                  <tr className="rec"><td><b>Freighter</b></td><td>Extensión de navegador (Stellar Development Foundation)</td><td>Opción recomendada para recargar tu billetera desde la computadora; el mejor soporte de contratos Soroban.</td></tr>
                  <tr><td><b>Cavos</b></td><td>Wallet embebida multichain</td><td>Entras con tu correo o redes sociales y recargas sin instalar extensiones.</td></tr>
                  <tr><td><b>Privy</b></td><td>Wallet embebida (correo, Google o SMS)</td><td>Ideal para quien nunca usó cripto: crea su wallet Stellar con un inicio de sesión.</td></tr>
                </tbody>
              </table>
            </div>
            <p className="fine">Ayni opera solo con XLM: las recargas llegan desde Freighter, Cavos o Privy y las comisiones de red las cubre Ayni. Custodiar fondos de terceros en Perú puede requerir registro ante la SBS/UIF; confírmalo con un abogado antes de lanzar.</p>
          </div>
        </section>

        <section className="block">
          <div className="wrap">
            <div className="cta">
              <div>
                <h2>Rescata el ayni, sin el desgaste</h2>
                <p style={{ marginTop: 6 }}>Crea el grupo, comparte el enlace y deja que el tesorero digital haga el resto.</p>
              </div>
              <button className="btn" id="cta-create" onClick={create}>Crear un grupo</button>
            </div>
          </div>
        </section>
        <footer>
          <div className="wrap">
            {APP_MODE === "supabase"
              ? "Ayni · demo de hackathon en Stellar Testnet. Los pagos usan XLM de prueba: no se mueve dinero real."
              : "Ayni · prototipo. Los pagos de esta demo son simulados: no se mueve dinero real ni se conecta a la red Stellar."}
          </div>
        </footer>
      </main>
    </>
  );
}
