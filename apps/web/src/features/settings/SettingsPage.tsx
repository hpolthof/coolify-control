import { useSearchParams } from 'react-router-dom';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { SystemPanel } from './SystemPanel';
import { ConnectorPanel } from './ConnectorPanel';
import { UsersPanel } from './UsersPanel';
import { KioskPanel } from './KioskPanel';

type TabValue = 'system' | 'connector' | 'users' | 'kiosk';

const TAB_OPTIONS: Array<{ value: TabValue; label: string }> = [
  { value: 'system', label: 'System' },
  { value: 'connector', label: 'Connector' },
  { value: 'users', label: 'Users' },
  { value: 'kiosk', label: 'Kiosk links' },
];

export function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (searchParams.get('tab') || 'system') as TabValue;

  const handleTabChange = (newTab: TabValue) => {
    setSearchParams({ tab: newTab });
  };

  return (
    <div className="p-6 max-w-[960px]">
      <h1 className="text-28 font-semibold text-ink mb-8">Settings</h1>

      <div className="mb-8">
        <SegmentedControl
          value={tab}
          onChange={handleTabChange}
          options={TAB_OPTIONS}
        />
      </div>

      {tab === 'system' && <SystemPanel />}
      {tab === 'connector' && <ConnectorPanel />}
      {tab === 'users' && <UsersPanel />}
      {tab === 'kiosk' && <KioskPanel />}
    </div>
  );
}
