import { notFound } from "next/navigation"
import { getProductBySlug } from "@/data/beautyProducts"
import { ProductPageClient } from "./ProductPageClient"
import { beautyProducts } from "@/data/beautyProducts"

type PageProps = {
  params: Promise<{ slug: string }>
}

export default async function ProductPage({ params }: PageProps) {
  const resolved = await params
  const product = getProductBySlug(resolved.slug)
  if (!product) return notFound()
  return <ProductPageClient product={product} />
}

export function generateStaticParams() {
  return beautyProducts.map(product => ({ slug: product.slug }))
}
