export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-bold text-white">Términos del Servicio</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        CopyPasteSocial — App de Facebook 1231742610032848. Última actualización: septiembre 2026.
      </p>
      <section className="mt-8 space-y-4 text-sm leading-6 text-muted-foreground">
        <p>
          CopyPasteSocial es una herramienta single-owner para que su titular importe, organice y
          publique su propio contenido en sus Páginas de Facebook y su cuenta profesional de
          Instagram. Al conectar tus cuentas aceptas estos términos y las condiciones de Meta.
        </p>
        <h2 className="pt-2 text-base font-semibold text-white">1. Uso permitido</h2>
        <p>
          Solo puedes conectar cuentas de las que seas titular o administrador autorizado, y solo
          puedes publicar contenido del que tengas derechos. Queda prohibido publicar spam, contenido
          ilegal o de terceros sin autorización.
        </p>
        <h2 className="pt-2 text-base font-semibold text-white">2. Tokens y desconexión</h2>
        <p>
          Los tokens de Meta se almacenan cifrados y se usan solo para publicar en tu nombre. Puedes
          revocar el acceso en cualquier momento desde /accounts o desde Facebook → Apps y sitios web.
        </p>
        <h2 className="pt-2 text-base font-semibold text-white">3. Disponibilidad</h2>
        <p>
          El servicio se ofrece &quot;tal cual&quot;. Meta puede cambiar sus APIs, permisos o límites;
          si un permiso deja de estar aprobado, la publicación en ese destino puede fallar hasta que
          se re-autorice.
        </p>
        <h2 className="pt-2 text-base font-semibold text-white">4. Contacto</h2>
        <p>https://copypastesocial.vercel.app — titular de la App de Facebook 1231742610032848.</p>
      </section>
    </main>
  );
}
