import { View, Text } from 'react-native';
import type { TeamHeader as TeamHeaderData } from '@shared/types/common';
import { TeamCrest } from '@/design-system/TeamCrest';

interface TeamHeaderProps {
  team: TeamHeaderData;
}

export function TeamHeader({ team }: TeamHeaderProps) {
  return (
    <View className="flex-row items-center gap-3 py-4">
      <TeamCrest name={team.nameHe} logoUrl={team.logoUrl} size={64} radius={8} />
      <View className="flex-1">
        <Text className="text-xl font-bold">{team.nameHe}</Text>
        {team.city && <Text className="text-sm text-gray-500">{team.city}</Text>}
      </View>
    </View>
  );
}
