import { DownloadedList } from "@/downloads/DownloadedList";
import { DownloadsArt } from "@/song/art";

/** Every song saved on this phone, newest first. */
export default function DownloadedSongs() {
  return (
    <DownloadedList
      kind="Downloads"
      title="Songs"
      art={<DownloadsArt />}
      sortKey="downloads"
      orderLabel="Date saved"
      defaultSort={{ field: "order", descending: false }}
      emptyBody="Tap the download button on a playlist, album or Spice, or choose Download from any song's menu, and it'll play here without a connection."
    />
  );
}
