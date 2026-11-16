import { Studio } from '../../components/studio';
export default function Optimize() {
  return <Studio instantPatchEnabled={Boolean(process.env.TIKQUICK_API_KEY)} />;
}
