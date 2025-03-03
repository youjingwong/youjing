import Link from "next/link";

interface BackToHomeLinkProps { }

const BackToHomeLink = ({ }: BackToHomeLinkProps): React.JSX.Element => {
  return (
    <div className="text-right">
      <Link href="/" className="underline">
        Back
      </Link>
    </div>
  );
};
export default BackToHomeLink;
