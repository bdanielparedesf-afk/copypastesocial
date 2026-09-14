export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-bold text-white">Política de Privacidad</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        CopyPasteSocial — App de Facebook 1231742610032848. Última actualización: septiembre 2026.
      </p>
      <section className="mt-8 space-y-4 text-sm leading-6 text-muted-foreground">
        <p>
          CopyPasteSocial (&quot;la App&quot;) permite a su propio titular conectar sus Páginas de
          Facebook y su cuenta profesional de Instagram para programar y publicar su propio
          contenido (videos, reels, fotos y textos). La App es de uso single-owner: solo el
          titular conecta sus cuentas.
        </p>
        <h2 className="pt-2 text-base font-semibold text-white">1. Datos que recibimos de Meta</h2>
        <p>
          Al iniciar sesión con Facebook autorizas los permisos: public_profile, pages_show_list,
          pages_read_engagement, pages_manage_posts, pages_manage_engagement,
          instagram_business_basic, instagram_business_content_publish,
          instagram_business_manage_comments, instagram_business_manage_messages e
          instagram_business_manage_insights.
        </p>
        <p>
          Recibimos: tu nombre/perfil público, la lista de Páginas que administras, la cuenta
          profesional de Instagram vinculada y los tokens de acceso OAuth necesarios para publicar
          en tu nombre. No recibimos tu contraseña de Facebook/Instagram.
        </p>
        <h2 className="pt-2 text-base font-semibold text-white">2. Cómo usamos los datos</h2>
        <p>
          Usamos los tokens únicamente para: (a) mostrar tus cuentas conectadas, (b) publicar o
          programar el contenido que tú eliges, (c) leer métricas básicas (alcance, reproducciones)
          y comentarios de tus propias publicaciones. Los tokens se guardan cifrados y nunca se
          comparten con terceros.
        </p>
        <h2 className="pt-2 text-base font-semibold text-white">3. Eliminación de datos</h2>
        <p>
          Puedes desconectar una cuenta en cualquier momento desde /accounts (revoca el token) o
          desde Configuración de Facebook → Apps y sitios web → CopyPasteSocial → Eliminar. Si
          quieres que borremos todos tus datos, escríbenos y eliminaremos tus tokens, cuentas y
          contenido asociado en un máximo de 7 días.
        </p>
        <h2 className="pt-2 text-base font-semibold text-white">4. Contacto</h2>
        <p>
          Titular: CopyPasteSocial — https://copypastesocial.vercel.app. Para ejercer acceso,
          rectificación o eliminación, usa la página de cuentas o responde a este sitio.
        </p>
      </section>
    </main>
  );
}
