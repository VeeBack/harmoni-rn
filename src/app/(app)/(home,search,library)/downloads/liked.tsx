import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { Api } from "@/api/endpoints";
import { DownloadedList } from "@/downloads/DownloadedList";
import { LikedArt } from "@/song/art";
import { useLibrary } from "@/state/library";

/** Your liked songs that are saved on this phone, in the order you liked them. */
export default function DownloadedLiked() {
  const liked = useLibrary((s) => s.liked);
  // The full list gives the order (it's on the phone once Liked Songs has opened); the ids alone do otherwise.
  const q = useQuery({ queryKey: ["likes"], queryFn: Api.likes });
  const ids = useMemo(() => {
    const newestFirst = q.data ? q.data.map((s) => s.id) : [...liked];
    return newestFirst.filter((id) => liked.has(id)).reverse();
  }, [q.data, liked]);
  return (
    <DownloadedList
      kind="Your library"
      title="Liked Songs"
      art={<LikedArt />}
      ids={ids}
      sortKey="downloads:liked"
      defaultSort={{ field: "order", descending: true }}
      open={{ label: "All Liked Songs", href: "/liked" }}
      emptyBody="Download Liked Songs (or any song you like) and they'll be here, ready without a connection."
    />
  );
}
