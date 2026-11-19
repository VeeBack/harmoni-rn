import { makeMutable } from "react-native-reanimated";

/** Now Playing's position, 0 (closed) to 1 (open), on the UI thread: the app behind scales back as it rises. */
export const sheetProgress = makeMutable(0);
