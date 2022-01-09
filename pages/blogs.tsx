import type { NextPage } from "next";
import Link from "next/link";

const Blogs: NextPage = () => {
  return (
    <div className="container py-20">
      <h1>Blogs</h1>

      <div className="text-right">
        <Link href="/blogs">
          <a className="disabled:bg-gray-50 ml-3">Blogs</a>
        </Link>
        <Link href="/">
          <a className="underline ml-3">About</a>
        </Link>
      </div>
    </div>
  );
};

export default Blogs;
