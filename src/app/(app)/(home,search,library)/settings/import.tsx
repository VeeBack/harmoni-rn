import { ImportMusic } from "@/settings/ImportMusic";
import { SettingsPage } from "@/settings/parts";

export default function ImportSettings() {
  return (
    <SettingsPage
      title="Import music"
      description="Bring your library, playlists and listening from Apple Music or Spotify. The file is read on this phone, and only the music in it is sent."
    >
      <ImportMusic />
    </SettingsPage>
  );
}
