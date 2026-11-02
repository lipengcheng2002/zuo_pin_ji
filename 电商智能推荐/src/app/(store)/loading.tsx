export default function StoreLoading() {
  return (
    <div className="container-x py-12" aria-busy="true" aria-label="页面加载中">
      <div className="h-3 w-24 skeleton" />
      <div className="mt-6 h-24 w-2/3 skeleton md:h-32" />
      <div className="mt-8 grid gap-6 lg:grid-cols-12">
        <div className="aspect-[3/2] skeleton lg:col-span-7" />
        <div className="space-y-3 lg:col-span-4 lg:col-start-9">
          <div className="h-3 w-2/3 skeleton" />
          <div className="h-3 w-full skeleton" />
          <div className="h-3 w-4/5 skeleton" />
          <div className="h-12 w-40 skeleton" />
        </div>
      </div>
      <div className="mt-14 grid grid-cols-2 gap-5 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index}>
            <div className="aspect-[4/5] skeleton" />
            <div className="mt-3 h-3 w-3/4 skeleton" />
            <div className="mt-2 h-3 w-1/2 skeleton" />
          </div>
        ))}
      </div>
    </div>
  );
}
