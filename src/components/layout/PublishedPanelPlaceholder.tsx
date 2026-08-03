export function PublishedPanelPlaceholder({
  title = "Nenhum dado publicado ainda",
  description = 'Vá em "Administração", carregue os arquivos, confira os resultados e clique em "Publicar" pra esse painel aparecer aqui.',
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="painel-frontend">
      <div className="content" style={{ padding: "14px 0 0" }}>
        <div className="empty">
          <h2 className="ph">{title}</h2>
          <p className="ps">{description}</p>
        </div>
      </div>
    </div>
  );
}
