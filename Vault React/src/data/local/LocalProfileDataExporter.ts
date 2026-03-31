import { Share } from "react-native";

import type { ProfileDataExporter } from "@src/domain/contracts";
import type { CollectibleItem, VaultUserPreferences } from "@src/domain/models";

export class LocalProfileDataExporter implements ProfileDataExporter {
  async exportJSON(input: {
    userName: string;
    planLabel: string;
    preferences: VaultUserPreferences;
    items: CollectibleItem[];
  }): Promise<string | null> {
    const payload = JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        ...input
      },
      null,
      2
    );

    await Share.share({ message: payload });
    return payload;
  }
}
