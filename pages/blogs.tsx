import type { NextPage } from "next";
import Link from "next/link";

const Blogs: NextPage = () => {
  return (
    <div className="container py-20">
      <h1>Blogs</h1>

      <div className="text-right">
        <Link href="/blogs" className="disabled:bg-gray-50 ml-3">
          Blogs
        </Link>
        <Link href="/" className="underline ml-3">
          About
        </Link>
      </div>
    </div>
  );
};

export default Blogs;
