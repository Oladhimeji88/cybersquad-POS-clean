import { deviceDetailText, type DeviceLine } from "../lib/devices";
export default function DeviceDetails({ line }: { line: DeviceLine }) {
  return <div className="space-y-1 text-xs text-muted-foreground break-words">
    {deviceDetailText(line).map((text, index) => <p key={index}>{text}</p>)}
  </div>;
}
