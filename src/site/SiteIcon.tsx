import {
  Activity,
  BadgeCheck,
  BarChart3,
  Box,
  Calendar,
  CheckCircle2,
  Cloud,
  CloudSun,
  Coins,
  Compass,
  Cpu,
  Crown,
  Database,
  Droplets,
  FileSearch,
  Gauge,
  GitBranch,
  Globe,
  HardDrive,
  ImageMinus,
  KeyRound,
  Layers,
  LayoutGrid,
  Lock,
  MapPin,
  Move3d,
  Network,
  PersonStanding,
  RefreshCw,
  Rocket,
  Rotate3d,
  ScanFace,
  Server,
  Shield,
  ShieldCheck,
  Shirt,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Trash2,
  TrendingDown,
  UserCheck,
  Workflow,
  Zap,
  type LucideProps,
} from 'lucide-react';

export type SiteIconKey =
  | 'activity'
  | 'badgeCheck'
  | 'barChart'
  | 'box'
  | 'calendar'
  | 'checkCircle'
  | 'cloud'
  | 'cloudSun'
  | 'coins'
  | 'compass'
  | 'cpu'
  | 'crown'
  | 'database'
  | 'droplets'
  | 'fileSearch'
  | 'gauge'
  | 'gitBranch'
  | 'globe'
  | 'hardDrive'
  | 'imageMinus'
  | 'keyRound'
  | 'layers'
  | 'layoutGrid'
  | 'lock'
  | 'mapPin'
  | 'move3d'
  | 'network'
  | 'personStanding'
  | 'refreshCw'
  | 'rocket'
  | 'rotate3d'
  | 'scanFace'
  | 'server'
  | 'shield'
  | 'shieldCheck'
  | 'shirt'
  | 'shoppingBag'
  | 'smartphone'
  | 'sparkles'
  | 'trash'
  | 'trendingDown'
  | 'userCheck'
  | 'workflow'
  | 'zap';

const ICON_MAP: Readonly<Record<SiteIconKey, React.ComponentType<LucideProps>>> = {
  activity: Activity,
  badgeCheck: BadgeCheck,
  barChart: BarChart3,
  box: Box,
  calendar: Calendar,
  checkCircle: CheckCircle2,
  cloud: Cloud,
  cloudSun: CloudSun,
  coins: Coins,
  compass: Compass,
  cpu: Cpu,
  crown: Crown,
  database: Database,
  droplets: Droplets,
  fileSearch: FileSearch,
  gauge: Gauge,
  gitBranch: GitBranch,
  globe: Globe,
  hardDrive: HardDrive,
  imageMinus: ImageMinus,
  keyRound: KeyRound,
  layers: Layers,
  layoutGrid: LayoutGrid,
  lock: Lock,
  mapPin: MapPin,
  move3d: Move3d,
  network: Network,
  personStanding: PersonStanding,
  refreshCw: RefreshCw,
  rocket: Rocket,
  rotate3d: Rotate3d,
  scanFace: ScanFace,
  server: Server,
  shield: Shield,
  shieldCheck: ShieldCheck,
  shirt: Shirt,
  shoppingBag: ShoppingBag,
  smartphone: Smartphone,
  sparkles: Sparkles,
  trash: Trash2,
  trendingDown: TrendingDown,
  userCheck: UserCheck,
  workflow: Workflow,
  zap: Zap,
};

export function SiteIcon({
  name,
  size = 16,
  strokeWidth = 1.75,
  className,
}: {
  readonly name: SiteIconKey;
  readonly size?: number;
  readonly strokeWidth?: number;
  readonly className?: string;
}) {
  const Icon = ICON_MAP[name];
  return <Icon size={size} strokeWidth={strokeWidth} className={className} aria-hidden="true" />;
}
