import Cards from "@/components/Cards";
import { useScrollRestore } from "@/hooks/common/useScrollRestore";

export const Libraries: React.FC = () => {
	useScrollRestore("/libraries", { useKeepAlive: true });
	return <Cards />;
};
